import {newQuickJSWASMModule, type QuickJSContext, type QuickJSDeferredPromise, type QuickJSHandle, type QuickJSWASMModule, RELEASE_SYNC} from "quickjs-emscripten";


interface QuickJsSandboxLimits {
    cpuTimeoutMs?: number;
    maxToolCalls?: number;
    maxLogsBytes?: number;
    wallTimeoutMs?: number;
    maxResultBytes?: number;
    memoryLimitBytes?: number;
    maxStackSizeBytes?: number;
    maxToolResponseBytes?: number;
}


export interface QuickJsSandboxResult {
    logs: string[];
    result: unknown;
    durationMs: number;
    toolCallCount: number;
}


export interface QuickJsSandboxOptions {
    code: string;
    limits?: QuickJsSandboxLimits;
    toolManifest: Record<string, string[]>;
    callTool: (providerSlug: string, jsName: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
}


let wasmModulePromise: Promise<QuickJSWASMModule> | null = null;


const DEFAULT_LIMITS: Required<QuickJsSandboxLimits> = {
    maxToolCalls: 25,
    cpuTimeoutMs: 4_000,
    wallTimeoutMs: 45_000,
    maxLogsBytes: 32 * 1024,
    maxResultBytes: 64 * 1024,
    maxStackSizeBytes: 512 * 1024,
    maxToolResponseBytes: 256 * 1024,
    memoryLimitBytes: 32 * 1024 * 1024,
};


const getQuickJsModule = (): Promise<QuickJSWASMModule> => {
    if (!wasmModulePromise) {
        wasmModulePromise = newQuickJSWASMModule(RELEASE_SYNC);
    }
    return wasmModulePromise;
};


const formatVmError = (vm: QuickJSContext, errHandle: QuickJSHandle): string => {
    const dumped = vm.dump(errHandle);

    if (dumped && typeof dumped === "object") {
        const obj = dumped as { name?: unknown; message?: unknown };
        const name = typeof obj.name === "string" ? obj.name : "Error";
        const message = typeof obj.message === "string" ? obj.message : JSON.stringify(dumped);

        return name === "Error" ? message : `${name}: ${message}`;
    }

    return typeof dumped === "string" ? dumped : String(dumped);
};


const buildBootstrapScript = (toolManifest: Record<string, string[]>): string => {
    const manifestJson = JSON.stringify(toolManifest);

    return `
        (() => {
            const __log = globalThis.__relayLog;
            const __call = globalThis.__relayCallTool;
            delete globalThis.__relayLog;
            delete globalThis.__relayCallTool;

            const formatArg = (value) => {
                if (typeof value === "string") return value;
                try { return JSON.stringify(value); } catch { return String(value); }
            };

            globalThis.console = Object.freeze({
                log: (...args) => __log("log", args.map(formatArg).join(" ")),
                info: (...args) => __log("info", args.map(formatArg).join(" ")),
                warn: (...args) => __log("warn", args.map(formatArg).join(" ")),
                error: (...args) => __log("error", args.map(formatArg).join(" ")),
            });

            const invoke = async (providerSlug, jsName, args) => {
                const serializedArgs = args === undefined ? "{}" : JSON.stringify(args);
                const raw = await __call(providerSlug, jsName, serializedArgs);
                return JSON.parse(raw);
            };

            const manifest = ${manifestJson};
            const toolsObj = {};
            for (const providerSlug of Object.keys(manifest)) {
                const ns = {};
                for (const jsName of manifest[providerSlug]) {
                    ns[jsName] = (args) => invoke(providerSlug, jsName, args);
                }
                toolsObj[providerSlug] = Object.freeze(ns);
            }
            globalThis.tools = Object.freeze(toolsObj);

            globalThis.callTool = (fullName, args) => {
                if (typeof fullName !== "string") {
                    return Promise.reject(new TypeError("Tool name must be a string like 'provider.tool'"));
                }
                const sep = fullName.includes(".") ? "." : ":";
                const idx = fullName.indexOf(sep);
                if (idx <= 0 || idx === fullName.length - 1) {
                    return Promise.reject(new Error("Tool name must be formatted as 'provider.tool'"));
                }
                return invoke(fullName.slice(0, idx), fullName.slice(idx + 1), args);
            };
        })();
    `;
};


export const runQuickJsSandbox = async (options: QuickJsSandboxOptions): Promise<QuickJsSandboxResult> => {
    const startedAt = Date.now();

    const limits: Required<QuickJsSandboxLimits> = {
        cpuTimeoutMs: options.limits?.cpuTimeoutMs ?? DEFAULT_LIMITS.cpuTimeoutMs,
        maxLogsBytes: options.limits?.maxLogsBytes ?? DEFAULT_LIMITS.maxLogsBytes,
        maxResultBytes: options.limits?.maxResultBytes ?? DEFAULT_LIMITS.maxResultBytes,
        memoryLimitBytes: options.limits?.memoryLimitBytes ?? DEFAULT_LIMITS.memoryLimitBytes,
        maxStackSizeBytes: options.limits?.maxStackSizeBytes ?? DEFAULT_LIMITS.maxStackSizeBytes,
        maxToolResponseBytes: options.limits?.maxToolResponseBytes ?? DEFAULT_LIMITS.maxToolResponseBytes,
        maxToolCalls: Math.max(1, Math.min(100, options.limits?.maxToolCalls ?? DEFAULT_LIMITS.maxToolCalls)),
        wallTimeoutMs: Math.max(1_000, Math.min(60_000, options.limits?.wallTimeoutMs ?? DEFAULT_LIMITS.wallTimeoutMs)),
    };

    const module = await getQuickJsModule();
    const runtime = module.newRuntime();

    runtime.setMemoryLimit(limits.memoryLimitBytes);
    runtime.setMaxStackSize(limits.maxStackSizeBytes);

    let activeCpuMs = 0;
    let aborted = false;
    let disposed = false;
    let cpuLimitExceeded = false;
    let sliceStartedAt: number | null = null;

    const abortController = new AbortController();

    runtime.setInterruptHandler(() => {
        if (aborted) return true;
        const elapsed = activeCpuMs + (sliceStartedAt !== null ? Date.now() - sliceStartedAt : 0);

        if (elapsed > limits.cpuTimeoutMs) {
            cpuLimitExceeded = true;
            return true;
        }

        return false;
    });

    const withCpuAccounting = <T>(fn: () => T): T => {
        sliceStartedAt = Date.now();

        try {
            return fn();
        }
        finally {
            activeCpuMs += Date.now() - sliceStartedAt;
            sliceStartedAt = null;
        }
    };

    let logsBytes = 0;
    let toolCallCount = 0;

    const logs: string[] = [];
    const vm = runtime.newContext();

    let fatalPumpError: Error | null = null;
    const activeDeferreds = new Set<QuickJSDeferredPromise>();

    const pumpJobs = () => {
        if (disposed || aborted) return;
        const result = withCpuAccounting(() => runtime.executePendingJobs());

        if (result.error) {
            const msg = formatVmError(vm, result.error);
            result.error.dispose();
            fatalPumpError = new Error(cpuLimitExceeded ? `Script exceeded CPU time limit (${limits.cpuTimeoutMs}ms)` : msg);
        }
    };

    let wallTimer: ReturnType<typeof setTimeout> | undefined;

    const wallTimeoutPromise = new Promise<never>((_, reject) => {
        wallTimer = setTimeout(() => {
            aborted = true;
            abortController.abort(new Error(`Script exceeded wall-clock timeout (${limits.wallTimeoutMs}ms)`));
            reject(new Error(`Script exceeded wall-clock timeout (${limits.wallTimeoutMs}ms)`));
        }, limits.wallTimeoutMs);
    });

    try {
        // Expose host log bridge
        const logFn = vm.newFunction("__relayLog", (levelHandle, msgHandle) => {
            const msg = vm.getString(msgHandle);
            const level = vm.getString(levelHandle);

            const line = level === "log" ? msg : `[${level}] ${msg}`;
            const lineBytes = Buffer.byteLength(line, "utf8");

            if (logs.length < 100 && logsBytes + lineBytes <= limits.maxLogsBytes) {
                logs.push(line);
                logsBytes += lineBytes;
            }
        });

        vm.setProp(vm.global, "__relayLog", logFn);
        logFn.dispose();

        // Expose host tool call bridge (async via QuickJSDeferredPromise + executePendingJobs)
        const callToolFn = vm.newFunction("__relayCallTool", (providerHandle, toolHandle, argsJsonHandle) => {
            const jsName = vm.getString(toolHandle);
            const providerSlug = vm.getString(providerHandle);
            const argsJson = argsJsonHandle ? vm.getString(argsJsonHandle) : "{}";

            const deferred = vm.newPromise();
            activeDeferreds.add(deferred);

            const settleWithError = (message: string) => {
                if (disposed || !deferred.alive) return;
                const errHandle = vm.newError(message);
                deferred.reject(errHandle);
                errHandle.dispose();
                activeDeferreds.delete(deferred);
                deferred.dispose();
                pumpJobs();
            };

            if (toolCallCount >= limits.maxToolCalls) {
                queueMicrotask(() => settleWithError(`Exceeded maximum tool call limit (${limits.maxToolCalls}) per execution.`));
                return deferred.handle;
            }

            let parsedArgs: Record<string, unknown>;
            try {
                const raw = JSON.parse(argsJson || "{}");
                if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
                    queueMicrotask(() => settleWithError("Tool arguments must be a JSON object."));
                    return deferred.handle;
                }
                parsedArgs = raw as Record<string, unknown>;
            }
            catch {
                queueMicrotask(() => settleWithError("Tool arguments must be JSON-serializable."));
                return deferred.handle;
            }

            toolCallCount += 1;

            options.callTool(providerSlug, jsName, parsedArgs, abortController.signal)
                .then((toolOutput) => {
                    if (disposed || !deferred.alive) return;

                    let serialized: string;
                    try {
                        serialized = JSON.stringify(toolOutput ?? null);
                    }
                    catch {
                        settleWithError(`Tool ${providerSlug}.${jsName} returned non-JSON data.`);
                        return;
                    }

                    const byteLength = Buffer.byteLength(serialized, "utf8");
                    if (byteLength > limits.maxToolResponseBytes) {
                        settleWithError(
                            `Tool ${providerSlug}.${jsName} response (${byteLength} bytes) 
                            exceeded sandbox limit (${limits.maxToolResponseBytes} bytes). Narrow your query or limit.`,
                        );
                        return;
                    }

                    const strHandle = vm.newString(serialized);
                    deferred.resolve(strHandle);
                    strHandle.dispose();
                    activeDeferreds.delete(deferred);
                    deferred.dispose();
                    pumpJobs();
                })
                .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err);
                    settleWithError(message);
                });

            return deferred.handle;
        });
        vm.setProp(vm.global, "__relayCallTool", callToolFn);
        callToolFn.dispose();

        // Install frozen console, tools, and callTool globals
        const bootstrapRes = withCpuAccounting(() => {
            return vm.evalCode(buildBootstrapScript(options.toolManifest), "relay-bootstrap.js");
        });

        if (bootstrapRes.error) {
            const msg = formatVmError(vm, bootstrapRes.error);
            bootstrapRes.error.dispose();
            throw new Error(`Sandbox bootstrap failed: ${msg}`);
        }

        bootstrapRes.value.dispose();

        // Wrap guest script in an async IIFE so top-level `await` and `return` work naturally
        const wrappedCode = `(async () => {\n"use strict";\n${options.code}\n})().then((value) => JSON.stringify(value === undefined ? null : value))`;
        const evalResult = withCpuAccounting(() => vm.evalCode(wrappedCode, "relay-execute.js"));

        if (evalResult.error) {
            runtime.setMemoryLimit(-1);
            const msg = formatVmError(vm, evalResult.error);
            evalResult.error.dispose();

            if (cpuLimitExceeded) {
                throw new Error(`Script exceeded CPU time limit (${limits.cpuTimeoutMs}ms)`);
            }

            throw new Error(msg);
        }

        const promiseHandle = evalResult.value;
        const hostPromise = vm.resolvePromise(promiseHandle);
        promiseHandle.dispose();

        // Pump initial sync microtasks so initial tool calls start immediately
        pumpJobs();
        if (fatalPumpError) throw fatalPumpError;

        const settled = await Promise.race([hostPromise, wallTimeoutPromise]);
        if (fatalPumpError) throw fatalPumpError;

        if (settled.error) {
            runtime.setMemoryLimit(-1);
            const msg = formatVmError(vm, settled.error);
            settled.error.dispose();
            if (cpuLimitExceeded) {
                throw new Error(`Script exceeded CPU time limit (${limits.cpuTimeoutMs}ms)`);
            }
            throw new Error(msg);
        }

        runtime.setMemoryLimit(-1);
        const serializedOutput = vm.typeof(settled.value) === "string"
            ? vm.getString(settled.value)
            : "null";
        settled.value.dispose();

        const outputBytes = Buffer.byteLength(serializedOutput, "utf8");
        if (outputBytes > limits.maxResultBytes) {
            throw new Error(`Script return value (${outputBytes} bytes) exceeded maximum result limit 
            (${limits.maxResultBytes} bytes). Return a smaller summary.`);
        }

        const parsedResult: unknown = serializedOutput === "undefined" ? null : JSON.parse(serializedOutput);

        return {
            logs,
            toolCallCount,
            result: parsedResult,
            durationMs: Date.now() - startedAt,
        };
    }
    finally {
        if (wallTimer) clearTimeout(wallTimer);

        aborted = true;
        disposed = true;
        abortController.abort();
        runtime.setMemoryLimit(-1);

        for (const deferred of activeDeferreds) {
            if (deferred.alive) deferred.dispose();
        }

        activeDeferreds.clear();

        vm.dispose();
        runtime.dispose();
    }
};
