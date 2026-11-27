import {useState} from "react";
import {cn} from "@/lib/utils/classnames";
import {formatRelativeTime} from "@/lib/utils/format";
import {Badge} from "@/lib/client/components/ui/badge";
import {Input} from "@/lib/client/components/ui/input";
import {Button} from "@/lib/client/components/ui/button";
import type {GatewayLog} from "@/lib/types/gateway.types";
import {Card, CardContent} from "@/lib/client/components/ui/card";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/lib/client/components/ui/dialog";
import {useClearLogsMutation} from "@/lib/client/react-query/query-mutations/gateway.mutations";
import {Activity, AlertCircle, Check, ChevronDown, ChevronRight, Code2, Copy, Play, Search, Terminal, Trash2, X} from "lucide-react";


interface LogsTabProps {
    logs: GatewayLog[];
    onReplayScript?: (code: string) => void;
}


export function LogsTab({ logs, onReplayScript }: LogsTabProps) {
    const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "error">("all");
    const [kindFilter, setKindFilter] = useState<"all" | "execute" | "call">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const clearMutation = useClearLogsMutation();

    const errorCount = logs.filter((l) => l.status === "error").length;

    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredLogs = logs.filter((entry) => {
        if (statusFilter !== "all" && entry.status !== statusFilter) return false;
        if (kindFilter !== "all" && entry.kind !== kindFilter) return false;
        if (!normalizedSearch) return true;

        return (entry.providerSlug?.toLowerCase().includes(normalizedSearch) ?? false)
            || (entry.toolName?.toLowerCase().includes(normalizedSearch) ?? false)
            || (entry.clientName?.toLowerCase().includes(normalizedSearch) ?? false)
            || (entry.errorMessage?.toLowerCase().includes(normalizedSearch) ?? false)
            || (entry.code?.toLowerCase().includes(normalizedSearch) ?? false);
    });

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const copyCode = async (id: string, code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedId(id);
        setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold tracking-tight">
                        Execution Audit Log
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Every <code className="font-mono text-xs text-foreground/85">call</code> and QuickJS{" "}
                        <code className="font-mono text-xs text-foreground/85">execute</code> run across connected AI clients and the playground.
                    </p>
                </div>

                {logs.length > 0 && (
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={clearMutation.isPending}
                        onClick={() => setConfirmClearOpen(true)}
                    >
                        <Trash2/>
                        Clear logs
                    </Button>
                )}
            </div>

            {logs.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-black/30 p-0.5 text-xs">
                            {(["all", "ok", "error"] as const).map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setStatusFilter(status)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-all",
                                        statusFilter === status
                                            ? "bg-card text-foreground shadow-sm ring-1 ring-white/[0.08]"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {status === "all" ? "All" : status === "ok" ? "OK" : "Errors"}
                                    {status === "error" && errorCount > 0 && (
                                        <span className="font-mono text-[10px] text-destructive tabular-nums">
                                            {errorCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-black/30 p-0.5 text-xs">
                            {(["all", "execute", "call"] as const).map((kind) => (
                                <button
                                    key={kind}
                                    type="button"
                                    onClick={() => setKindFilter(kind)}
                                    className={cn(
                                        "rounded-md px-2.5 py-1 font-medium transition-all",
                                        kindFilter === kind
                                            ? "bg-card text-foreground shadow-sm ring-1 ring-white/[0.08]"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {kind === "all" ? "All kinds" : kind}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"/>
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter by tool, client, or error..."
                            aria-label="Filter audit logs"
                            className="h-8 pr-7 pl-8 text-xs"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                aria-label="Clear log filter"
                                onClick={() => setSearchQuery("")}
                                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="size-3.5"/>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {logs.length === 0 ? (
                <Card className="border-dashed border-border/90 bg-card/50">
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
                            <Activity className="size-5"/>
                        </div>
                        <div className="max-w-md space-y-1">
                            <p className="text-base font-semibold tracking-tight">No executions recorded yet</p>
                            <p className="text-sm text-muted-foreground">
                                Tool calls and QuickJS script executions will appear here with latency, client attribution, and error details.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : filteredLogs.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                        <Search className="size-6 text-muted-foreground"/>
                        <p className="font-medium">No log entries match your current filters</p>
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                                setStatusFilter("all");
                                setKindFilter("all");
                                setSearchQuery("");
                            }}
                        >
                            Reset filters
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/80 bg-card/85 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
                    <div className="divide-y divide-border/60">
                        {filteredLogs.map((entry) => {
                            const hasDetails = Boolean(entry.code || entry.errorMessage);
                            const isExpanded = expandedIds.has(entry.id);
                            const rowContent = (
                                <div className="flex w-full flex-wrap items-center justify-between gap-2.5 px-4 py-3 text-left">
                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                        {hasDetails ? (
                                            <span className="text-muted-foreground">
                                                {isExpanded ? <ChevronDown className="size-3.5"/> : <ChevronRight className="size-3.5"/>}
                                            </span>
                                        ) : (
                                            <span className="size-3.5"/>
                                        )}

                                        <Badge variant={entry.status === "ok" ? "success" : "destructive"} className="font-mono uppercase">
                                            {entry.status}
                                        </Badge>

                                        <Badge variant="outline" className="font-mono">
                                            {entry.kind === "execute" ? <Code2/> : <Play/>}
                                            {entry.kind}
                                        </Badge>

                                        <span className="truncate font-mono text-xs font-medium text-foreground">
                                            {entry.kind === "call"
                                                ? `${entry.providerSlug ?? "?"}.${entry.toolName ?? "?"}`
                                                : `QuickJS (${entry.toolCallCount} call${entry.toolCallCount === 1 ? "" : "s"})`}
                                        </span>

                                        {entry.clientName && (
                                            <Badge variant="secondary">
                                                {entry.clientName}
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2.5 font-mono text-[11px] tabular-nums">
                                        <span className={entry.durationMs >= 1500 ? "text-warning" : "text-muted-foreground"}>
                                            {entry.durationMs}ms
                                        </span>
                                        <span className="text-border">•</span>
                                        <span
                                            className="text-muted-foreground"
                                            title={new Date(entry.createdAt).toLocaleString()}
                                        >
                                            {formatRelativeTime(entry.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            );

                            return (
                                <div key={entry.id} className="transition-colors hover:bg-white/[0.015]">
                                    {hasDetails ? (
                                        <button
                                            type="button"
                                            aria-expanded={isExpanded}
                                            onClick={() => toggleExpanded(entry.id)}
                                            className="w-full"
                                        >
                                            {rowContent}
                                        </button>
                                    ) : (
                                        rowContent
                                    )}

                                    {!isExpanded && entry.errorMessage && (
                                        <div className="px-4 pb-3 pl-10">
                                            <p className="truncate font-mono text-xs text-destructive/90">
                                                {entry.errorMessage}
                                            </p>
                                        </div>
                                    )}

                                    {isExpanded && hasDetails && (
                                        <div className="flex flex-col gap-2.5 border-t border-border/50 bg-black/30 px-4 py-3 pl-10">
                                            {entry.errorMessage && (
                                                <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 font-mono text-xs break-all text-destructive">
                                                    {entry.errorMessage}
                                                </div>
                                            )}

                                            {entry.code && (
                                                <div className="relay-code-well overflow-hidden rounded-lg">
                                                    <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                                                        <span className="font-mono text-[11px] text-muted-foreground">
                                                            QuickJS script
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                type="button"
                                                                size="xs"
                                                                variant="ghost"
                                                                onClick={() => copyCode(entry.id, entry.code!)}
                                                            >
                                                                {copiedId === entry.id ? <Check className="text-brand"/> : <Copy/>}
                                                                {copiedId === entry.id ? "Copied" : "Copy"}
                                                            </Button>
                                                            {onReplayScript && (
                                                                <Button
                                                                    type="button"
                                                                    size="xs"
                                                                    variant="secondary"
                                                                    onClick={() => onReplayScript(entry.code!)}
                                                                >
                                                                    <Terminal/>
                                                                    Replay
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <pre className="max-h-56 overflow-auto p-3 font-mono text-xs leading-relaxed text-foreground/90">
                                                        {entry.code}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Clear execution logs?</DialogTitle>
                        <DialogDescription>
                            This permanently removes all {logs.length} recorded audit log entries from SQLite.
                        </DialogDescription>
                    </DialogHeader>
                    {clearMutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{clearMutation.error.message}</AlertDescription>
                        </Alert>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={clearMutation.isPending}
                            onClick={() => setConfirmClearOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={clearMutation.isPending}
                            onClick={() => {
                                clearMutation.mutate(undefined, {
                                    onSuccess: () => setConfirmClearOpen(false),
                                });
                            }}
                        >
                            <Trash2/>
                            {clearMutation.isPending ? "Clearing..." : "Clear all logs"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
