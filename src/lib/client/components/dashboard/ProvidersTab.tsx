import {type SubmitEvent, useState} from "react";
import {cn} from "@/lib/utils/classnames";
import {formatRelativeTime} from "@/lib/utils/format";
import {Badge} from "@/lib/client/components/ui/badge";
import {Input} from "@/lib/client/components/ui/input";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {Switch} from "@/lib/client/components/ui/switch";
import {Separator} from "@/lib/client/components/ui/separator";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {Card, CardContent} from "@/lib/client/components/ui/card";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/lib/client/components/ui/tooltip";
import type {GatewayBuiltIn, GatewayProvider, ProviderPreset} from "@/lib/types/gateway.types";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/lib/client/components/ui/dialog";
import {
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Cpu,
    Globe,
    KeyRound,
    Link2,
    Lock,
    Play,
    Plus,
    RefreshCw,
    Search,
    Settings2,
    Shield,
    Trash2,
    Unlink,
    Wrench,
    X,
} from "lucide-react";
import {
    useCreateProviderMutation,
    useDeleteProviderMutation,
    useDisconnectProviderOAuthMutation,
    useStartProviderOAuthMutation,
    useSyncProviderMutation,
    useToggleProviderToolMutation,
    useUpdateProviderMutation,
} from "@/lib/client/react-query/query-mutations/gateway.mutations";


const PROVIDER_PRESETS: ProviderPreset[] = [
    { label: "Steam (Built-in)", kind: "builtin", name: "Steam", slug: "steam", builtinKey: "steam" },
    { label: "MyLists", kind: "remote_mcp", name: "MyLists", slug: "mylists", url: "https://mylists.info/api/mcp", authType: "oauth" },
    { label: "Famiglia", kind: "remote_mcp", name: "Famiglia Recipes", slug: "famiglia", url: "https://famiglia-recipes.mylists.info/api/mcp", authType: "oauth" },
    { label: "PostHog", kind: "remote_mcp", name: "PostHog", slug: "posthog", url: "https://mcp.posthog.com/mcp", authType: "oauth" },
    { label: "Cloudflare", kind: "remote_mcp", name: "Cloudflare", slug: "cloudflare", url: "https://mcp.cloudflare.com/mcp", authType: "oauth" },
];


interface ProvidersTabProps {
    builtins: GatewayBuiltIn[];
    providers: GatewayProvider[];
    onTryTool?: (toolId: string) => void;
}


export function ProvidersTab({ providers, builtins, onTryTool }: ProvidersTabProps) {
    const [addDialogState, setAddDialogState] = useState<{ open: boolean; key: number; preset?: ProviderPreset }>({
        open: false,
        key: 0,
    });
    const [filterQuery, setFilterQuery] = useState("");
    const [toolFilters, setToolFilters] = useState<Record<string, string>>({});
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
    const [editingProvider, setEditingProvider] = useState<GatewayProvider | null>(null);
    const [deletingProvider, setDeletingProvider] = useState<GatewayProvider | null>(null);

    const syncMutation = useSyncProviderMutation();
    const deleteMutation = useDeleteProviderMutation();
    const toggleToolMutation = useToggleProviderToolMutation();
    const oauthStartMutation = useStartProviderOAuthMutation();
    const toggleProviderMutation = useUpdateProviderMutation();
    const oauthDisconnectMutation = useDisconnectProviderOAuthMutation();

    const actionError =
        syncMutation.error?.message
        ?? oauthStartMutation.error?.message
        ?? oauthDisconnectMutation.error?.message
        ?? toggleProviderMutation.error?.message
        ?? toggleToolMutation.error?.message
        ?? deleteMutation.error?.message
        ?? null;

    const openAddDialog = (preset?: ProviderPreset) => {
        setAddDialogState((prev) => ({
            open: true,
            key: prev.key + 1,
            preset,
        }));
    };

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const normalizedFilter = filterQuery.trim().toLowerCase();
    const filteredProviders = normalizedFilter
        ? providers.filter((p) =>
            p.name.toLowerCase().includes(normalizedFilter)
            || p.slug.toLowerCase().includes(normalizedFilter)
            || (p.url?.toLowerCase().includes(normalizedFilter) ?? false)
            || p.tools.some((t) =>
                t.name.toLowerCase().includes(normalizedFilter)
                || t.jsName.toLowerCase().includes(normalizedFilter)
                || t.description.toLowerCase().includes(normalizedFilter),
            ),
        )
        : providers;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold tracking-tight">Tool Providers</h2>
                    <p className="text-sm text-muted-foreground">
                        Connect remote Streamable HTTP MCP servers or enable built-in personal tool suites.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {providers.length > 0 && (
                        <div className="relative w-56 sm:w-64">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                placeholder="Filter providers or tools..."
                                aria-label="Filter providers or tools"
                                className="h-8 pr-7 pl-8 text-xs"
                            />
                            {filterQuery && (
                                <button
                                    type="button"
                                    aria-label="Clear filter"
                                    onClick={() => setFilterQuery("")}
                                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="size-3.5"/>
                                </button>
                            )}
                        </div>
                    )}
                    <Button size="sm" onClick={() => openAddDialog()}>
                        <Plus/>
                        Add provider
                    </Button>
                </div>
            </div>

            {actionError && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4"/>
                    <AlertDescription>{actionError}</AlertDescription>
                </Alert>
            )}

            {providers.length === 0 ? (
                <Card className="border-dashed border-border/90 bg-card/50">
                    <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand">
                            <Wrench className="size-5"/>
                        </div>
                        <div className="max-w-md space-y-1">
                            <p className="text-base font-semibold tracking-tight">No providers configured yet</p>
                            <p className="text-sm text-muted-foreground">
                                Connect remote MCP servers or built-in suites to populate your unified gateway catalog.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {PROVIDER_PRESETS.map((preset) => (
                                <Button
                                    key={preset.slug}
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => openAddDialog(preset)}
                                >
                                    <Plus className="text-brand"/>
                                    {preset.label}
                                </Button>
                            ))}
                        </div>
                        <Button size="sm" onClick={() => openAddDialog()}>
                            <Plus/>
                            Add custom provider
                        </Button>
                    </CardContent>
                </Card>
            ) : filteredProviders.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                        <Search className="size-6 text-muted-foreground"/>
                        <p className="font-medium">No providers match &ldquo;{filterQuery}&rdquo;</p>
                        <Button variant="ghost" size="xs" onClick={() => setFilterQuery("")}>
                            Clear filter
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {filteredProviders.map((p) => {
                        const isExpanded = expandedIds.has(p.id);
                        const isSyncing = syncMutation.isPending && syncMutation.variables === p.id;
                        const isStartingOAuth = oauthStartMutation.isPending && oauthStartMutation.variables === p.id;
                        const needsOAuth = p.kind === "remote_mcp" && p.authType === "oauth" && !p.oauthConnected;
                        const missingBearer = p.kind === "remote_mcp" && p.authType === "bearer" && !p.hasAuthSecret;
                        const hasIssue = Boolean(p.lastError);
                        const toolQuery = (toolFilters[p.id] ?? "").trim().toLowerCase();
                        const visibleTools = toolQuery
                            ? p.tools.filter((t) =>
                                t.jsName.toLowerCase().includes(toolQuery)
                                || t.name.toLowerCase().includes(toolQuery)
                                || t.description.toLowerCase().includes(toolQuery),
                            )
                            : p.tools;

                        const statusDotClass = hasIssue
                            ? "bg-destructive shadow-[0_0_8px_oklch(0.68_0.195_23/0.75)]"
                            : !p.enabled
                                ? "bg-muted-foreground/45"
                                : needsOAuth || missingBearer
                                    ? "bg-warning shadow-[0_0_8px_oklch(0.80_0.15_76/0.65)]"
                                    : "bg-brand shadow-[0_0_8px_oklch(0.73_0.165_162/0.7)]";

                        return (
                            <Card
                                key={p.id}
                                size="sm"
                                className={cn(
                                    "gap-0 py-0 transition-colors hover:border-foreground/15",
                                    !p.enabled && "opacity-75",
                                )}
                            >
                                <div className="flex flex-col gap-3 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div
                                                className={cn(
                                                    "relative mt-0.5 flex size-9.5 shrink-0 items-center justify-center rounded-lg border",
                                                    p.kind === "builtin"
                                                        ? "border-brand/25 bg-brand/10 text-brand"
                                                        : "border-white/[0.08] bg-white/[0.03] text-foreground/85",
                                                )}
                                            >
                                                {p.kind === "builtin"
                                                    ? <Cpu className="size-4"/>
                                                    : <Globe className="size-4"/>
                                                }
                                                <span
                                                    aria-hidden="true"
                                                    className={cn("absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-card", statusDotClass)}
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                                                        {p.name}
                                                    </h3>
                                                    <code className="rounded-md border border-white/[0.07] bg-black/35 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                                        {p.slug}
                                                    </code>
                                                    <Badge variant="outline">
                                                        {p.kind === "builtin" ? "Built-in" : "Remote MCP"}
                                                    </Badge>
                                                    {p.kind === "remote_mcp" && p.authType === "oauth" && (
                                                        <Badge variant={p.oauthConnected ? "success" : "warning"}>
                                                            {p.oauthConnected ? "OAuth connected" : "Needs OAuth"}
                                                        </Badge>
                                                    )}
                                                    {p.kind === "remote_mcp" && p.authType === "bearer" && (
                                                        <Badge variant={p.hasAuthSecret ? "success" : "warning"}>
                                                            {p.hasAuthSecret ? "Bearer token" : "Missing token"}
                                                        </Badge>
                                                    )}
                                                    {p.readOnly && (
                                                        <Badge variant="info">
                                                            <Lock/>
                                                            Read-only
                                                        </Badge>
                                                    )}
                                                    {!p.enabled && (
                                                        <Badge variant="secondary">Disabled</Badge>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                                                    <span
                                                        className="max-w-xs truncate font-mono text-[11px] sm:max-w-md"
                                                        title={p.kind === "builtin" ? `builtin:${p.builtinKey}` : (p.url ?? undefined)}
                                                    >
                                                        {p.kind === "builtin" ? `builtin:${p.builtinKey}` : p.url}
                                                    </span>
                                                    <span className="text-border">•</span>
                                                    <span className="font-mono text-[11px] tabular-nums">
                                                        {p.enabledToolCount}/{p.toolCount} tools active
                                                    </span>
                                                    <span className="text-border">•</span>
                                                    <span
                                                        className="text-[11px]"
                                                        title={p.lastSyncedAt ? new Date(p.lastSyncedAt).toLocaleString() : undefined}
                                                    >
                                                        {p.lastSyncedAt ? `Synced ${formatRelativeTime(p.lastSyncedAt)}` : "Never synced"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {p.kind === "remote_mcp" && p.authType === "oauth" && (
                                                p.oauthConnected ? (
                                                    <Button
                                                        variant="outline"
                                                        size="xs"
                                                        disabled={oauthDisconnectMutation.isPending}
                                                        onClick={() => oauthDisconnectMutation.mutate(p.id)}
                                                    >
                                                        <Unlink/>
                                                        Disconnect
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="default"
                                                        size="xs"
                                                        disabled={isStartingOAuth}
                                                        onClick={() => oauthStartMutation.mutate(p.id)}
                                                    >
                                                        <KeyRound/>
                                                        {isStartingOAuth ? "Redirecting..." : "Connect OAuth"}
                                                    </Button>
                                                )
                                            )}

                                            <Button
                                                variant="outline"
                                                size="xs"
                                                disabled={isSyncing}
                                                onClick={() => syncMutation.mutate(p.id)}
                                            >
                                                <RefreshCw className={isSyncing ? "animate-spin" : ""}/>
                                                {isSyncing ? "Syncing..." : "Sync"}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                size="xs"
                                                onClick={() => setEditingProvider(p)}
                                                aria-label={`Configure ${p.name}`}
                                            >
                                                <Settings2/>
                                                Config
                                            </Button>

                                            <Tooltip>
                                                <TooltipTrigger
                                                    render={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            aria-label={`Delete ${p.name}`}
                                                            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                                            disabled={deleteMutation.isPending}
                                                            onClick={() => setDeletingProvider(p)}
                                                        />
                                                    }
                                                >
                                                    <Trash2/>
                                                </TooltipTrigger>
                                                <TooltipContent>Delete provider</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>

                                    {p.lastError && (
                                        <Alert variant="destructive">
                                            <AlertCircle className="size-4"/>
                                            <AlertDescription className="break-all font-mono text-xs">{p.lastError}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-black/20 px-4 py-2.5 text-xs">
                                    <div className="flex flex-wrap items-center gap-5">
                                        <label
                                            className="flex cursor-pointer items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                                            htmlFor={`enabled-${p.id}`}
                                        >
                                            <Switch
                                                id={`enabled-${p.id}`}
                                                size="sm"
                                                checked={p.enabled}
                                                onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, enabled: checked })}
                                            />
                                            <span className={p.enabled ? "text-foreground" : undefined}>Enabled</span>
                                        </label>

                                        <label
                                            className="flex cursor-pointer items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                                            htmlFor={`readonly-${p.id}`}
                                        >
                                            <Switch
                                                id={`readonly-${p.id}`}
                                                size="sm"
                                                checked={p.readOnly}
                                                onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, readOnly: checked })}
                                            />
                                            <span className={p.readOnly ? "text-foreground" : undefined}>Read-only only</span>
                                        </label>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="text-muted-foreground hover:text-foreground"
                                        onClick={() => toggleExpanded(p.id)}
                                    >
                                        {isExpanded ? <ChevronDown/> : <ChevronRight/>}
                                        {isExpanded ? "Hide tools" : "Inspect tools"}
                                        <span className="ml-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/80">
                                            {p.enabledToolCount}/{p.toolCount}
                                        </span>
                                    </Button>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-border/60 bg-black/30 p-3">
                                        {p.tools.length === 0 ? (
                                            <p className="py-4 text-center text-xs text-muted-foreground">
                                                No tools synced yet.{" "}
                                                {needsOAuth
                                                    ? "Connect OAuth first, then click Sync."
                                                    : "Click Sync above to discover upstream tools."}
                                            </p>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                {p.tools.length > 5 && (
                                                    <div className="relative">
                                                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"/>
                                                        <Input
                                                            value={toolFilters[p.id] ?? ""}
                                                            onChange={(e) => setToolFilters((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                            placeholder={`Filter ${p.tools.length} tools in ${p.slug}...`}
                                                            aria-label={`Filter ${p.name} tools`}
                                                            className="h-7.5 pl-8 text-xs"
                                                        />
                                                    </div>
                                                )}

                                                <div className="relay-code-well max-h-80 divide-y divide-white/[0.05] overflow-y-auto rounded-lg">
                                                    {visibleTools.length === 0 ? (
                                                        <p className="py-5 text-center text-xs text-muted-foreground">
                                                            No tools match &ldquo;{toolFilters[p.id]}&rdquo;.
                                                        </p>
                                                    ) : (
                                                        visibleTools.map((tool) => {
                                                            const fullToolId = `${p.slug}.${tool.jsName}`;
                                                            return (
                                                                <div
                                                                    key={tool.id}
                                                                    className={cn(
                                                                        "group/tool flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.025]",
                                                                        !tool.enabled && "opacity-55",
                                                                    )}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                                            <code className="font-mono text-xs font-medium text-foreground">
                                                                                <span className="text-muted-foreground">{p.slug}.</span>
                                                                                {tool.jsName}
                                                                            </code>
                                                                            {tool.readOnly && (
                                                                                <Badge variant="info" className="h-4 px-1.5 text-[10px]">
                                                                                    read-only
                                                                                </Badge>
                                                                            )}
                                                                            {tool.destructive && (
                                                                                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                                                                                    destructive
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                        {tool.description && (
                                                                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                                                                {tool.description}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                                                                        {onTryTool && p.enabled && tool.enabled && (
                                                                            <Tooltip>
                                                                                <TooltipTrigger
                                                                                    render={
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="icon-xs"
                                                                                            aria-label={`Try ${fullToolId} in Playground`}
                                                                                            className="opacity-70 transition-opacity group-hover/tool:opacity-100 hover:text-brand"
                                                                                            onClick={() => onTryTool(fullToolId)}
                                                                                        />
                                                                                    }
                                                                                >
                                                                                    <Play/>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent>Try in Playground</TooltipContent>
                                                                            </Tooltip>
                                                                        )}

                                                                        <Switch
                                                                            size="sm"
                                                                            aria-label={`Enable ${tool.name}`}
                                                                            checked={tool.enabled}
                                                                            onCheckedChange={(checked) => toggleToolMutation.mutate({ toolId: tool.id, enabled: checked })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            <AddProviderDialog
                key={addDialogState.key}
                open={addDialogState.open}
                builtins={builtins}
                initialPreset={addDialogState.preset}
                onOpenChange={(open) => setAddDialogState((prev) => ({ ...prev, open }))}
            />

            {editingProvider && (
                <EditProviderDialog
                    provider={editingProvider}
                    builtins={builtins}
                    onClose={() => setEditingProvider(null)}
                />
            )}

            <Dialog
                open={deletingProvider !== null}
                onOpenChange={(open) => {
                    if (!open) setDeletingProvider(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete {deletingProvider?.name}?</DialogTitle>
                        <DialogDescription>
                            This removes <code className="font-mono text-xs text-foreground">{deletingProvider?.slug}</code>, its stored credentials, and all{" "}
                            {deletingProvider?.toolCount ?? 0} synced tools from your gateway.
                        </DialogDescription>
                    </DialogHeader>
                    {deleteMutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{deleteMutation.error.message}</AlertDescription>
                        </Alert>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeletingProvider(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                                if (!deletingProvider) return;
                                deleteMutation.mutate(deletingProvider.id, {
                                    onSuccess: () => setDeletingProvider(null),
                                });
                            }}
                        >
                            <Trash2/>
                            {deleteMutation.isPending ? "Deleting..." : "Delete provider"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


interface AddProviderDialogProps {
    open: boolean;
    builtins: GatewayBuiltIn[];
    initialPreset?: ProviderPreset;
    onOpenChange: (open: boolean) => void;
}


function AddProviderDialog({ open, builtins, initialPreset, onOpenChange }: AddProviderDialogProps) {
    const [kind, setKind] = useState<"remote_mcp" | "builtin">(initialPreset?.kind ?? "remote_mcp");
    const [name, setName] = useState(initialPreset?.name ?? "");
    const [slug, setSlug] = useState(initialPreset?.slug ?? "");
    const [url, setUrl] = useState(initialPreset?.url ?? "");
    const [authType, setAuthType] = useState<"oauth" | "bearer" | "none">(initialPreset?.authType ?? "oauth");
    const [authSecret, setAuthSecret] = useState("");
    const [builtinKey, setBuiltinKey] = useState(initialPreset?.builtinKey ?? builtins[0]?.key ?? "steam");
    const [configValues, setConfigValues] = useState<Record<string, string>>({});
    const [readOnly, setReadOnly] = useState(false);

    const activeBuiltIn = builtins.find((b) => b.key === builtinKey);

    const mutation = useCreateProviderMutation(() => {
        setName("");
        setSlug("");
        setUrl("");
        setAuthSecret("");
        setConfigValues({});
        setReadOnly(false);
        onOpenChange(false);
    });

    const applyPreset = (preset: ProviderPreset) => {
        setKind(preset.kind);
        setName(preset.name);
        setSlug(preset.slug);
        setUrl(preset.url ?? "");
        if (preset.authType) setAuthType(preset.authType);
        if (preset.builtinKey) setBuiltinKey(preset.builtinKey);
    };

    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate({
            name,
            slug: slug || undefined,
            kind,
            url: kind === "remote_mcp" ? url : undefined,
            authType: kind === "remote_mcp" ? authType : undefined,
            authSecret: kind === "remote_mcp" && authType === "bearer" ? authSecret : undefined,
            builtinKey: kind === "builtin" ? builtinKey : undefined,
            config: kind === "builtin" ? configValues : undefined,
            readOnly,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add Provider</DialogTitle>
                    <DialogDescription>
                        Choose a quick preset or configure any Streamable HTTP MCP server.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Quick presets
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {PROVIDER_PRESETS.map((preset) => {
                            const isSelected = slug === preset.slug && kind === preset.kind;
                            return (
                                <Button
                                    key={preset.slug}
                                    type="button"
                                    variant={isSelected ? "secondary" : "outline"}
                                    size="xs"
                                    className={isSelected ? "border-brand/40 bg-brand/12 text-brand" : undefined}
                                    onClick={() => applyPreset(preset)}
                                >
                                    {preset.label}
                                </Button>
                            );
                        })}
                    </div>
                </div>

                <Separator className="bg-border/60"/>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {mutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{mutation.error.message}</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            onClick={() => setKind("remote_mcp")}
                            className={cn(
                                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                                kind === "remote_mcp"
                                    ? "border-brand/50 bg-brand/10 text-foreground"
                                    : "border-border/80 bg-black/20 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                            )}
                        >
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                <Link2 className={cn("size-3.5", kind === "remote_mcp" ? "text-brand" : "text-muted-foreground")}/>
                                Remote MCP
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                Streamable HTTP endpoint
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setKind("builtin");
                                if (activeBuiltIn && !name) {
                                    setName(activeBuiltIn.defaultName);
                                    setSlug(activeBuiltIn.defaultSlug);
                                }
                            }}
                            className={cn(
                                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                                kind === "builtin"
                                    ? "border-brand/50 bg-brand/10 text-foreground"
                                    : "border-border/80 bg-black/20 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                            )}
                        >
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                <Cpu className={cn("size-3.5", kind === "builtin" ? "text-brand" : "text-muted-foreground")}/>
                                Built-in Module
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                Native personal tool suite
                            </span>
                        </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="provider-name" className="text-xs">Display Name</Label>
                            <Input
                                id="provider-name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="MyLists"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="provider-slug" className="text-xs">Tool Namespace</Label>
                            <Input
                                id="provider-slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="mylists"
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>

                    {kind === "remote_mcp" ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="provider-url" className="text-xs">Streamable HTTP Endpoint URL</Label>
                                <Input
                                    id="provider-url"
                                    type="url"
                                    required
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://mylists.info/api/mcp"
                                    className="font-mono text-xs"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Upstream Authentication</span>
                                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/80 bg-black/30 p-1">
                                    {(["oauth", "bearer", "none"] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setAuthType(option)}
                                            className={cn(
                                                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                                                authType === option
                                                    ? "bg-card text-foreground shadow-sm ring-1 ring-white/[0.08]"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {option === "oauth" ? "OAuth 2.1" : option === "bearer" ? "Bearer Token" : "No Auth"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {authType === "bearer" && (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="provider-secret" className="text-xs">Bearer Token</Label>
                                    <Input
                                        id="provider-secret"
                                        type="password"
                                        value={authSecret}
                                        onChange={(e) => setAuthSecret(e.target.value)}
                                        placeholder="Paste API / personal access token"
                                    />
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Shield className="size-3 text-brand"/>
                                        Encrypted at rest in SQLite
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {activeBuiltIn && (
                                <p className="rounded-lg border border-border/70 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
                                    {activeBuiltIn.description}
                                </p>
                            )}
                            {activeBuiltIn?.configFields.map((field) => (
                                <div key={field.key} className="flex flex-col gap-1.5">
                                    <Label htmlFor={`builtin-${field.key}`} className="text-xs">{field.label}</Label>
                                    <Input
                                        id={`builtin-${field.key}`}
                                        type={field.secret ? "password" : "text"}
                                        value={configValues[field.key] ?? ""}
                                        onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                        placeholder={field.placeholder}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    <label
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-border/70 bg-black/20 px-3 py-2.5 text-xs"
                        htmlFor="provider-readonly"
                    >
                        <span className="flex items-center gap-2 text-foreground/90">
                            <Lock className="size-3.5 text-muted-foreground"/>
                            Enforce read-only mode on this provider
                        </span>
                        <Switch
                            id="provider-readonly"
                            size="sm"
                            checked={readOnly}
                            onCheckedChange={setReadOnly}
                        />
                    </label>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving..." : "Add provider"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


interface EditProviderDialogProps {
    provider: GatewayProvider;
    builtins: GatewayBuiltIn[];
    onClose: () => void;
}


function EditProviderDialog({ provider, builtins, onClose }: EditProviderDialogProps) {
    const [name, setName] = useState(provider.name);
    const [url, setUrl] = useState(provider.url ?? "");
    const [authType, setAuthType] = useState<"oauth" | "bearer" | "none">(provider.authType);
    const [authSecret, setAuthSecret] = useState("");
    const [configValues, setConfigValues] = useState<Record<string, string>>({});

    const activeBuiltIn = provider.builtinKey
        ? builtins.find((b) => b.key === provider.builtinKey)
        : undefined;

    const mutation = useUpdateProviderMutation(onClose);

    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate({
            id: provider.id,
            name,
            url: provider.kind === "remote_mcp" ? url : undefined,
            authType: provider.kind === "remote_mcp" ? authType : undefined,
            authSecret: provider.kind === "remote_mcp" && authType === "bearer" && authSecret.trim()
                ? authSecret
                : undefined,
            config: provider.kind === "builtin" && Object.values(configValues).some((v) => v.trim())
                ? configValues
                : undefined,
        });
    };

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Configure {provider.name}</DialogTitle>
                    <DialogDescription>
                        Namespace <code className="font-mono text-xs text-foreground">{provider.slug}</code>. Stored secrets are encrypted at rest and never displayed back.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {mutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{mutation.error.message}</AlertDescription>
                        </Alert>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-provider-name" className="text-xs">Display Name</Label>
                        <Input
                            id="edit-provider-name"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {provider.kind === "remote_mcp" ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="edit-provider-url" className="text-xs">Endpoint URL</Label>
                                <Input
                                    id="edit-provider-url"
                                    type="url"
                                    required
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="font-mono text-xs"
                                />
                                {url.trim() !== (provider.url ?? "") && (
                                    <p className="text-[11px] text-warning">
                                        Changing the endpoint URL clears stored credentials and cached tools.
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Upstream Authentication</span>
                                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/80 bg-black/30 p-1">
                                    {(["oauth", "bearer", "none"] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setAuthType(option)}
                                            className={cn(
                                                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                                                authType === option
                                                    ? "bg-card text-foreground shadow-sm ring-1 ring-white/[0.08]"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {option === "oauth" ? "OAuth 2.1" : option === "bearer" ? "Bearer Token" : "No Auth"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {authType === "bearer" && (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="edit-provider-secret" className="text-xs">
                                        Replace Bearer Token {provider.hasAuthSecret ? "(currently set)" : ""}
                                    </Label>
                                    <Input
                                        id="edit-provider-secret"
                                        type="password"
                                        value={authSecret}
                                        onChange={(e) => setAuthSecret(e.target.value)}
                                        placeholder="Leave blank to keep existing token"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        activeBuiltIn?.configFields.map((field) => (
                            <div key={field.key} className="flex flex-col gap-1.5">
                                <Label htmlFor={`edit-builtin-${field.key}`} className="text-xs">{field.label}</Label>
                                <Input
                                    id={`edit-builtin-${field.key}`}
                                    type={field.secret ? "password" : "text"}
                                    value={configValues[field.key] ?? ""}
                                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    placeholder={provider.hasConfig ? "Leave blank to keep existing config" : field.placeholder}
                                />
                            </div>
                        ))
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving..." : "Save changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
