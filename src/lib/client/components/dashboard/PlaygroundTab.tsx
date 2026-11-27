import {type KeyboardEvent, type SubmitEvent, useState} from "react";
import {cn} from "@/lib/utils/classnames";
import {Badge} from "@/lib/client/components/ui/badge";
import {Input} from "@/lib/client/components/ui/input";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {Textarea} from "@/lib/client/components/ui/textarea";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/lib/client/components/ui/tooltip";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";
import {
    AlertCircle,
    ArrowRight,
    Check,
    Code2,
    Copy,
    FileCode2,
    Play,
    Plus,
    RotateCcw,
    Search,
    Sparkles,
    Terminal,
    X,
} from "lucide-react";
import {
    usePlaygroundCallMutation,
    usePlaygroundDescribeMutation,
    usePlaygroundExecuteMutation,
    usePlaygroundSearchMutation,
} from "@/lib/client/react-query/query-mutations/gateway.mutations";


const DEFAULT_SCRIPT = `// List every available provider & tool in the sandbox:
const catalog = Object.fromEntries(
  Object.entries(tools).map(([provider, fns]) => [provider, Object.keys(fns)])
);
console.log("Loaded namespaces:", Object.keys(catalog));
return catalog;`;


interface PlaygroundTabProps {
    initialMode?: "execute" | "call";
    initialToolId?: string;
    initialScriptCode?: string;
}


export function PlaygroundTab({ initialMode = "execute", initialToolId = "", initialScriptCode }: PlaygroundTabProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedToolId, setSelectedToolId] = useState(initialToolId);
    const [callArgsText, setCallArgsText] = useState("{}");
    const [runnerMode, setRunnerMode] = useState<"execute" | "call">(initialMode);
    const [scriptCode, setScriptCode] = useState(initialScriptCode ?? DEFAULT_SCRIPT);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const callMutation = usePlaygroundCallMutation();
    const searchMutation = usePlaygroundSearchMutation();
    const executeMutation = usePlaygroundExecuteMutation();
    const describeMutation = usePlaygroundDescribeMutation();

    let argsJsonError: string | null = null;
    if (callArgsText.trim()) {
        try {
            const parsed = JSON.parse(callArgsText) as unknown;
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                argsJsonError = "Arguments must be a JSON object.";
            }
        }
        catch (err) {
            argsJsonError = err instanceof Error ? err.message : "Invalid JSON.";
        }
    }

    const copyText = async (key: string, value: string) => {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    };

    const handleSearch = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        searchMutation.mutate(searchQuery);
    };

    const inspectTool = (toolId: string) => {
        setSelectedToolId(toolId);
        describeMutation.mutate(toolId);
    };

    const runExecute = () => {
        if (executeMutation.isPending || !scriptCode.trim()) return;
        executeMutation.mutate(scriptCode);
    };

    const runCall = () => {
        if (callMutation.isPending || !selectedToolId.trim() || argsJsonError) return;
        callMutation.mutate({ tool: selectedToolId.trim(), argsText: callArgsText });
    };

    const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, action: () => void) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            action();
        }
    };

    const formatArgsJson = () => {
        if (argsJsonError || !callArgsText.trim()) return;
        const formatted = JSON.stringify(JSON.parse(callArgsText), null, 2);
        setCallArgsText(formatted);
    };

    const describedTool = describeMutation.data?.tools[0];

    let formattedCallOutput = callMutation.data?.text ?? "";
    if (formattedCallOutput) {
        try {
            formattedCallOutput = JSON.stringify(JSON.parse(formattedCallOutput), null, 2);
        }
        catch {
            // Keep non-JSON tool output as-is
        }
    }

    const insertIntoScript = () => {
        if (!describedTool) return;
        const snippet = `const result = await tools.${describedTool.providerSlug}.${describedTool.jsName}({});\nreturn result;`;
        setScriptCode(snippet);
        setRunnerMode("execute");
    };

    return (
        <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5" size="sm">
                <CardHeader className="gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2">
                            <span className="flex size-6.5 items-center justify-center rounded-md border border-brand/25 bg-brand/10 text-brand">
                                <Search className="size-3.5"/>
                            </span>
                            FTS5 Tool Explorer
                        </CardTitle>
                        <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={searchMutation.isPending}
                            onClick={() => {
                                setSearchQuery("*");
                                searchMutation.mutate("*");
                            }}
                        >
                            List all
                        </Button>
                    </div>
                    <CardDescription className="text-xs">
                        Query BM25 full-text search and inspect generated TypeScript signatures.
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-3.5">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                aria-label="Search tools"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="e.g. steam playtime, recipe, or *"
                                className="pr-7 pl-8 text-xs"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    aria-label="Clear search query"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="size-3.5"/>
                                </button>
                            )}
                        </div>
                        <Button type="submit" size="sm" disabled={searchMutation.isPending}>
                            {searchMutation.isPending ? "..." : "Search"}
                        </Button>
                    </form>

                    {!searchMutation.data ? (
                        <div className="relay-code-well flex flex-col items-center gap-2.5 rounded-xl px-4 py-8 text-center">
                            <Sparkles className="size-5 text-brand/80"/>
                            <div className="space-y-0.5">
                                <p className="text-xs font-medium text-foreground">Discover indexed tools</p>
                                <p className="text-xs text-muted-foreground">
                                    Search by keyword or browse your entire synced catalog.
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={searchMutation.isPending}
                                onClick={() => {
                                    setSearchQuery("*");
                                    searchMutation.mutate("*");
                                }}
                            >
                                Browse all tools (*)
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Search results</span>
                                <span className="font-mono tabular-nums">
                                    {searchMutation.data.tools.length} hit{searchMutation.data.tools.length === 1 ? "" : "s"}
                                </span>
                            </div>

                            <div className="relay-code-well flex max-h-64 flex-col divide-y divide-white/[0.05] overflow-y-auto rounded-xl">
                                {searchMutation.data.tools.length === 0 ? (
                                    <p className="py-6 text-center text-xs text-muted-foreground">
                                        No matching tools found.
                                    </p>
                                ) : (
                                    searchMutation.data.tools.map((hit) => {
                                        const isSelected = selectedToolId === hit.id;
                                        return (
                                            <button
                                                key={hit.id}
                                                type="button"
                                                onClick={() => inspectTool(hit.id)}
                                                className={cn(
                                                    "flex flex-col items-start gap-1 border-l-2 px-3 py-2.5 text-left transition-colors",
                                                    isSelected
                                                        ? "border-brand bg-brand/10 text-foreground"
                                                        : "border-transparent hover:bg-white/[0.03]",
                                                )}
                                            >
                                                <div className="flex w-full items-center justify-between gap-2">
                                                    <code className="truncate font-mono text-xs font-medium text-foreground">
                                                        <span className="text-muted-foreground">{hit.providerSlug}.</span>
                                                        {hit.jsName}
                                                    </code>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {hit.readOnly && (
                                                            <Badge variant="info" className="h-4 px-1.5 text-[10px]">
                                                                ro
                                                            </Badge>
                                                        )}
                                                        {hit.destructive && (
                                                            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                                                                del
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                {hit.description && (
                                                    <span className="line-clamp-1 text-xs text-muted-foreground">
                                                        {hit.description}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {describedTool && (
                        <div className="relay-code-well overflow-hidden rounded-xl">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                                    <FileCode2 className="size-3.5 shrink-0 text-brand"/>
                                    <span className="truncate">{describedTool.providerSlug}.{describedTool.jsName}.d.ts</span>
                                </span>

                                <div className="flex items-center gap-1">
                                    <Tooltip>
                                        <TooltipTrigger
                                            render={
                                                <Button
                                                    type="button"
                                                    size="icon-xs"
                                                    variant="ghost"
                                                    aria-label="Copy TypeScript signature"
                                                    onClick={() => copyText("sig", describedTool.signature)}
                                                />
                                            }
                                        >
                                            {copiedKey === "sig" ? <Check className="text-brand"/> : <Copy/>}
                                        </TooltipTrigger>
                                        <TooltipContent>Copy signature</TooltipContent>
                                    </Tooltip>

                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        onClick={insertIntoScript}
                                    >
                                        <Plus/>
                                        Script
                                    </Button>

                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="secondary"
                                        onClick={() => {
                                            setRunnerMode("call");
                                            setSelectedToolId(describedTool.id);
                                        }}
                                    >
                                        Call
                                        <ArrowRight/>
                                    </Button>
                                </div>
                            </div>

                            <pre className="max-h-56 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                                {describedTool.signature}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="lg:col-span-7" size="sm">
                <CardHeader className="gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2">
                            <span className="flex size-6.5 items-center justify-center rounded-md border border-brand/25 bg-brand/10 text-brand">
                                <Terminal className="size-3.5"/>
                            </span>
                            Sandbox & Call Runner
                        </CardTitle>

                        <div className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-black/35 p-0.5">
                            <button
                                type="button"
                                onClick={() => setRunnerMode("execute")}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-all",
                                    runnerMode === "execute"
                                        ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Code2 className="size-3"/>
                                execute
                            </button>
                            <button
                                type="button"
                                onClick={() => setRunnerMode("call")}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-all",
                                    runnerMode === "call"
                                        ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Play className="size-3"/>
                                call
                            </button>
                        </div>
                    </div>
                    <CardDescription className="text-xs">
                        Execute sandboxed QuickJS scripts or invoke an individual gateway tool directly.
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-3.5">
                    {runnerMode === "execute" ? (
                        <>
                            <div className="relay-code-well overflow-hidden rounded-xl">
                                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="playground-code" className="font-mono text-xs text-foreground/90">
                                            sandbox.js
                                        </Label>
                                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                            QuickJS WASM
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {scriptCode !== DEFAULT_SCRIPT && (
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="ghost"
                                                onClick={() => setScriptCode(DEFAULT_SCRIPT)}
                                            >
                                                <RotateCcw/>
                                                Reset
                                            </Button>
                                        )}
                                        <kbd className="hidden rounded border border-white/[0.08] bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
                                            Ctrl/⌘ + ↵
                                        </kbd>
                                    </div>
                                </div>

                                <Textarea
                                    id="playground-code"
                                    rows={9}
                                    spellCheck={false}
                                    value={scriptCode}
                                    onChange={(e) => setScriptCode(e.target.value)}
                                    onKeyDown={(e) => handleEditorKeyDown(e, runExecute)}
                                    className="min-h-44 rounded-none border-0 bg-transparent px-3.5 py-3 font-mono text-xs leading-relaxed focus-visible:ring-0 dark:bg-transparent"
                                />

                                <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.015] px-3 py-2">
                                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                                        await tools.&lt;provider&gt;.&lt;fn&gt;(args)
                                    </span>
                                    <Button
                                        size="xs"
                                        disabled={executeMutation.isPending || !scriptCode.trim()}
                                        onClick={runExecute}
                                    >
                                        <Play/>
                                        {executeMutation.isPending ? "Running..." : "Run in QuickJS"}
                                    </Button>
                                </div>
                            </div>

                            {executeMutation.error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="size-4"/>
                                    <AlertDescription className="font-mono text-xs">
                                        {executeMutation.error.message}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {executeMutation.data && (
                                <div className="relay-code-well overflow-hidden rounded-xl">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                        <div className="flex items-center gap-2 font-mono text-xs">
                                            <Badge variant="success">OK</Badge>
                                            <span className="text-muted-foreground tabular-nums">
                                                {executeMutation.data.durationMs}ms
                                            </span>
                                            <span className="text-border">•</span>
                                            <span className="text-muted-foreground tabular-nums">
                                                {executeMutation.data.toolCallCount} tool call{executeMutation.data.toolCallCount === 1 ? "" : "s"}
                                            </span>
                                        </div>

                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => copyText("exec-out", executeMutation.data.resultJson)}
                                        >
                                            {copiedKey === "exec-out" ? <Check className="text-brand"/> : <Copy/>}
                                            {copiedKey === "exec-out" ? "Copied" : "Copy JSON"}
                                        </Button>
                                    </div>

                                    {executeMutation.data.logs.length > 0 && (
                                        <div className="border-b border-white/[0.06] bg-black/35 px-3 py-2">
                                            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                                console.log
                                            </span>
                                            <pre className="max-h-28 overflow-auto font-mono text-xs text-warning/90">
                                                {executeMutation.data.logs.join("\n")}
                                            </pre>
                                        </div>
                                    )}

                                    <pre className="max-h-80 overflow-auto p-3.5 font-mono text-xs leading-relaxed text-foreground/95">
                                        {executeMutation.data.resultJson}
                                    </pre>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="playground-tool-id" className="text-xs">Tool Identifier</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="playground-tool-id"
                                        value={selectedToolId}
                                        onChange={(e) => setSelectedToolId(e.target.value)}
                                        placeholder="steam.search_store"
                                        className="font-mono text-xs"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={!selectedToolId.trim() || describeMutation.isPending}
                                        onClick={() => describeMutation.mutate(selectedToolId.trim())}
                                    >
                                        Describe
                                    </Button>
                                </div>
                            </div>

                            <div className="relay-code-well overflow-hidden rounded-xl">
                                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="playground-call-args" className="font-mono text-xs text-foreground/90">
                                            args.json
                                        </Label>
                                        {argsJsonError ? (
                                            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                                                Invalid JSON
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                                JSON
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="ghost"
                                            disabled={Boolean(argsJsonError) || !callArgsText.trim()}
                                            onClick={formatArgsJson}
                                        >
                                            Format
                                        </Button>
                                        <kbd className="hidden rounded border border-white/[0.08] bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
                                            Ctrl/⌘ + ↵
                                        </kbd>
                                    </div>
                                </div>

                                <Textarea
                                    id="playground-call-args"
                                    rows={5}
                                    spellCheck={false}
                                    value={callArgsText}
                                    onChange={(e) => setCallArgsText(e.target.value)}
                                    onKeyDown={(e) => handleEditorKeyDown(e, runCall)}
                                    className="min-h-28 rounded-none border-0 bg-transparent px-3.5 py-3 font-mono text-xs leading-relaxed focus-visible:ring-0 dark:bg-transparent"
                                />

                                <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.015] px-3 py-2">
                                    <span className="truncate font-mono text-[11px] text-destructive">
                                        {argsJsonError ?? ""}
                                    </span>
                                    <Button
                                        size="xs"
                                        disabled={callMutation.isPending || !selectedToolId.trim() || Boolean(argsJsonError)}
                                        onClick={runCall}
                                    >
                                        <Play/>
                                        {callMutation.isPending ? "Calling..." : "Invoke tool"}
                                    </Button>
                                </div>
                            </div>

                            {callMutation.error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="size-4"/>
                                    <AlertDescription className="font-mono text-xs">
                                        {callMutation.error.message}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {callMutation.data && (
                                <div className="relay-code-well overflow-hidden rounded-xl">
                                    <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                        <Badge variant={callMutation.data.isError ? "destructive" : "success"}>
                                            {callMutation.data.isError ? "TOOL ERROR" : "OK"}
                                        </Badge>
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => copyText("call-out", formattedCallOutput)}
                                        >
                                            {copiedKey === "call-out" ? <Check className="text-brand"/> : <Copy/>}
                                            {copiedKey === "call-out" ? "Copied" : "Copy output"}
                                        </Button>
                                    </div>
                                    <pre className="max-h-80 overflow-auto p-3.5 font-mono text-xs leading-relaxed text-foreground/95">
                                        {formattedCallOutput}
                                    </pre>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
