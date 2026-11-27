import {type SubmitEvent, useState} from "react";
import {Badge} from "@/lib/client/components/ui/badge";
import {Input} from "@/lib/client/components/ui/input";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {Switch} from "@/lib/client/components/ui/switch";
import {Separator} from "@/lib/client/components/ui/separator";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import type {GatewayBuiltIn, GatewayProvider, ProviderPreset} from "@/lib/types/gateway.types";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/lib/client/components/ui/dialog";
import {AlertCircle, ChevronDown, ChevronRight, KeyRound, Link2, Plus, RefreshCw, Settings2, Trash2, Unlink, Wrench} from "lucide-react";
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
    { label: "Famiglia", kind: "remote_mcp", name: "Famiglia Recipes", slug: "famiglia", url: "https://famiglia.example/api/mcp", authType: "oauth" },
    { label: "PostHog", kind: "remote_mcp", name: "PostHog", slug: "posthog", url: "https://mcp.posthog.com/mcp", authType: "oauth" },
    { label: "Cloudflare", kind: "remote_mcp", name: "Cloudflare", slug: "cloudflare", url: "https://observability.mcp.cloudflare.com/mcp", authType: "oauth" },
];


interface ProvidersTabProps {
    builtins: GatewayBuiltIn[];
    providers: GatewayProvider[];
}


export function ProvidersTab({ providers, builtins }: ProvidersTabProps) {
    const [addOpen, setAddOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
    const [editingProvider, setEditingProvider] = useState<GatewayProvider | null>(null);

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

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-medium">Tool Providers</h2>
                    <p className="text-sm text-muted-foreground">
                        Connect remote Streamable HTTP MCP servers or enable built-in personal tool suites.
                    </p>
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus/>
                    Add provider
                </Button>
            </div>

            {actionError && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4"/>
                    <AlertDescription>{actionError}</AlertDescription>
                </Alert>
            )}

            {providers.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                        <Wrench className="size-8 text-muted-foreground"/>
                        <div>
                            <p className="font-medium">No providers configured yet</p>
                            <p className="text-sm text-muted-foreground">
                                Add MyLists, Famiglia, PostHog, Cloudflare, or the built-in Steam provider to populate your gateway.
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setAddOpen(true)}>
                            <Plus/>
                            Add your first provider
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {providers.map((p) => {
                        const isExpanded = expandedIds.has(p.id);
                        const isSyncing = syncMutation.isPending && syncMutation.variables === p.id;
                        const isStartingOAuth = oauthStartMutation.isPending && oauthStartMutation.variables === p.id;

                        return (
                            <Card key={p.id} size="sm">
                                <CardHeader className="gap-2">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle>{p.name}</CardTitle>
                                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                                    {p.slug}
                                                </code>
                                                <Badge variant="outline">
                                                    {p.kind === "builtin" ? "Built-in" : "Remote MCP"}
                                                </Badge>
                                                {p.kind === "remote_mcp" && p.authType === "oauth" && (
                                                    <Badge variant={p.oauthConnected ? "default" : "secondary"}>
                                                        {p.oauthConnected ? "OAuth connected" : "Needs OAuth"}
                                                    </Badge>
                                                )}
                                                {p.kind === "remote_mcp" && p.authType === "bearer" && (
                                                    <Badge variant={p.hasAuthSecret ? "default" : "secondary"}>
                                                        {p.hasAuthSecret ? "Bearer token" : "Missing token"}
                                                    </Badge>
                                                )}
                                                {p.readOnly && <Badge variant="secondary">Read-only</Badge>}
                                                {!p.enabled && <Badge variant="destructive">Disabled</Badge>}
                                            </div>
                                            <CardDescription className="flex flex-wrap items-center gap-2 font-mono text-xs">
                                                <span>{p.kind === "builtin" ? `builtin:${p.builtinKey}` : p.url}</span>
                                                <span>·</span>
                                                <span>{p.enabledToolCount}/{p.toolCount} tools active</span>
                                            </CardDescription>
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

                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                aria-label={`Delete ${p.name}`}
                                                disabled={deleteMutation.isPending}
                                                onClick={() => deleteMutation.mutate(p.id)}
                                            >
                                                <Trash2 className="text-destructive"/>
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="flex flex-col gap-3">
                                    {p.lastError && (
                                        <Alert variant="destructive">
                                            <AlertCircle className="size-4"/>
                                            <AlertDescription className="break-all text-xs">{p.lastError}</AlertDescription>
                                        </Alert>
                                    )}

                                    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-2.5 text-xs">
                                        <div className="flex flex-wrap items-center gap-5">
                                            <label className="flex cursor-pointer items-center gap-2" htmlFor={`enabled-${p.id}`}>
                                                <Switch
                                                    id={`enabled-${p.id}`}
                                                    size="sm"
                                                    checked={p.enabled}
                                                    onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, enabled: checked })}
                                                />
                                                <span>Enabled</span>
                                            </label>

                                            <label className="flex cursor-pointer items-center gap-2" htmlFor={`readonly-${p.id}`}>
                                                <Switch
                                                    id={`readonly-${p.id}`}
                                                    size="sm"
                                                    checked={p.readOnly}
                                                    onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, readOnly: checked })}
                                                />
                                                <span>Read-only only</span>
                                            </label>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            onClick={() => toggleExpanded(p.id)}
                                        >
                                            {isExpanded ? <ChevronDown/> : <ChevronRight/>}
                                            {isExpanded ? "Hide tools" : `Inspect ${p.toolCount} tools`}
                                        </Button>
                                    </div>

                                    {isExpanded && (
                                        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2.5">
                                            {p.tools.length === 0 ? (
                                                <p className="py-2 text-center text-xs text-muted-foreground">
                                                    No tools synced
                                                    yet. {p.kind === "remote_mcp" && p.authType === "oauth" && !p.oauthConnected ? "Connect OAuth first, then sync." : "Click Sync to fetch tools."}
                                                </p>
                                            ) : (
                                                p.tools.map((tool) => (
                                                    <div
                                                        key={tool.id}
                                                        className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <code className="font-mono text-xs font-medium text-foreground">
                                                                    {p.slug}.{tool.jsName}
                                                                </code>
                                                                {tool.readOnly && <Badge variant="outline">read-only</Badge>}
                                                                {tool.destructive && <Badge variant="destructive">destructive</Badge>}
                                                            </div>
                                                            {tool.description && (
                                                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                                                    {tool.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Switch
                                                            size="sm"
                                                            aria-label={`Enable ${tool.name}`}
                                                            checked={tool.enabled}
                                                            onCheckedChange={(checked) => toggleToolMutation.mutate({ toolId: tool.id, enabled: checked })}
                                                        />
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <AddProviderDialog
                open={addOpen}
                builtins={builtins}
                onOpenChange={setAddOpen}
            />

            {editingProvider && (
                <EditProviderDialog
                    provider={editingProvider}
                    builtins={builtins}
                    onClose={() => setEditingProvider(null)}
                />
            )}
        </div>
    );
}


interface AddProviderDialogProps {
    open: boolean;
    builtins: GatewayBuiltIn[];
    onOpenChange: (open: boolean) => void;
}


function AddProviderDialog({ open, builtins, onOpenChange }: AddProviderDialogProps) {
    const [kind, setKind] = useState<"remote_mcp" | "builtin">("remote_mcp");
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [url, setUrl] = useState("");
    const [authType, setAuthType] = useState<"oauth" | "bearer" | "none">("oauth");
    const [authSecret, setAuthSecret] = useState("");
    const [builtinKey, setBuiltinKey] = useState(builtins[0]?.key ?? "steam");
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
                        Pick a quick preset or enter any Streamable HTTP MCP server.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-1.5">
                    {PROVIDER_PRESETS.map((preset) => (
                        <Button
                            key={preset.slug}
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => applyPreset(preset)}
                        >
                            {preset.label}
                        </Button>
                    ))}
                </div>

                <Separator/>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    {mutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{mutation.error.message}</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={kind === "remote_mcp" ? "default" : "outline"}
                            onClick={() => setKind("remote_mcp")}
                        >
                            <Link2/>
                            Remote MCP (HTTP)
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={kind === "builtin" ? "default" : "outline"}
                            onClick={() => {
                                setKind("builtin");
                                if (activeBuiltIn && !name) {
                                    setName(activeBuiltIn.defaultName);
                                    setSlug(activeBuiltIn.defaultSlug);
                                }
                            }}
                        >
                            <Wrench/>
                            Built-in Module
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="provider-name">Display Name</Label>
                            <Input
                                id="provider-name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="MyLists"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="provider-slug">Code Mode Namespace</Label>
                            <Input
                                id="provider-slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="mylists"
                                className="font-mono"
                            />
                        </div>
                    </div>

                    {kind === "remote_mcp" ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="provider-url">Streamable HTTP Endpoint URL</Label>
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
                                <div className="grid grid-cols-3 gap-2">
                                    {(["oauth", "bearer", "none"] as const).map((option) => (
                                        <Button
                                            key={option}
                                            type="button"
                                            size="xs"
                                            variant={authType === option ? "default" : "outline"}
                                            onClick={() => setAuthType(option)}
                                        >
                                            {option === "oauth" ? "OAuth 2.1" : option === "bearer" ? "Bearer Token" : "No Auth"}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            {authType === "bearer" && (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="provider-secret">Bearer Token (encrypted in SQLite)</Label>
                                    <Input
                                        id="provider-secret"
                                        type="password"
                                        value={authSecret}
                                        onChange={(e) => setAuthSecret(e.target.value)}
                                        placeholder="Paste API / personal access token"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {activeBuiltIn && (
                                <p className="text-xs text-muted-foreground">{activeBuiltIn.description}</p>
                            )}
                            {activeBuiltIn?.configFields.map((field) => (
                                <div key={field.key} className="flex flex-col gap-1.5">
                                    <Label htmlFor={`builtin-${field.key}`}>{field.label}</Label>
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

                    <label className="flex cursor-pointer items-center gap-2 text-xs" htmlFor="provider-readonly">
                        <Switch
                            id="provider-readonly"
                            size="sm"
                            checked={readOnly}
                            onCheckedChange={setReadOnly}
                        />
                        <span>Enforce read-only mode on this provider</span>
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
        <Dialog open onOpenChange={(open) => {
            if (!open) onClose();
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Configure {provider.name}</DialogTitle>
                    <DialogDescription>
                        Namespace: <code className="font-mono text-xs">{provider.slug}</code>. Stored secrets are encrypted at rest and never displayed back.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    {mutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{mutation.error.message}</AlertDescription>
                        </Alert>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-provider-name">Display Name</Label>
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
                                <Label htmlFor="edit-provider-url">Endpoint URL</Label>
                                <Input
                                    id="edit-provider-url"
                                    type="url"
                                    required
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Upstream Auth</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["oauth", "bearer", "none"] as const).map((option) => (
                                        <Button
                                            key={option}
                                            type="button"
                                            size="xs"
                                            variant={authType === option ? "default" : "outline"}
                                            onClick={() => setAuthType(option)}
                                        >
                                            {option === "oauth" ? "OAuth 2.1" : option === "bearer" ? "Bearer Token" : "No Auth"}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            {authType === "bearer" && (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="edit-provider-secret">
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
                                <Label htmlFor={`edit-builtin-${field.key}`}>{field.label}</Label>
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
