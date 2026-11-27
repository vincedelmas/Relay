import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {Switch} from "@/lib/client/components/ui/switch";
import {Checkbox} from "@/lib/client/components/ui/checkbox";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {AlertCircle, Code2, KeyRound, Layers, Unplug} from "lucide-react";
import {disconnectClientFn, saveClientPolicyFn} from "@/lib/server/functions/gateway";
import type {GatewayClient, GatewayProvider} from "@/lib/client/components/dashboard/types";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";


interface ClientsTabProps {
    mcpEndpoint: string;
    clients: GatewayClient[];
    providers: GatewayProvider[];
    onChanged: () => Promise<void>;
}


export function ClientsTab({ clients, providers, mcpEndpoint, onChanged }: ClientsTabProps) {
    const [error, setError] = useState<string | null>(null);

    const policyMutation = useMutation({
        mutationFn: (data: {
            clientId: string;
            readOnly: boolean;
            mode: "code" | "classic";
            allowedProviderIds: string[];
        }) => saveClientPolicyFn({ data }),
        onMutate: () => setError(null),
        onError: (err) => {
            return setError(err instanceof Error ? err.message : "Failed to update client policy.");
        },
        onSuccess: async () => {
            await onChanged();
        },
    });

    const disconnectMutation = useMutation({
        mutationFn: (clientId: string) => disconnectClientFn({ data: { clientId } }),
        onMutate: () => setError(null),
        onError: (err) => {
            return setError(err instanceof Error ? err.message : "Failed to disconnect client.");
        },
        onSuccess: async () => {
            await onChanged();
        },
    });

    const toggleAllowedProvider = (client: GatewayClient, providerId: string, checked: boolean) => {
        const nextAllowed = checked
            ? Array.from(new Set([...client.allowedProviderIds, providerId]))
            : client.allowedProviderIds.filter((id) => id !== providerId);

        policyMutation.mutate({
            mode: client.mode,
            clientId: client.clientId,
            readOnly: client.readOnly,
            allowedProviderIds: nextAllowed,
        });
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-base font-medium">
                    Connected AI Clients
                </h2>
                <p className="text-sm text-muted-foreground">
                    Switch any connected OAuth 2.1 client between Code Mode and Classic Mode,{" "}
                    toggle read-only enforcement, or edit its allowed providers live.
                </p>
            </div>

            {error &&
                <Alert variant="destructive">
                    <AlertCircle className="size-4"/>
                    <AlertDescription>
                        {error}
                    </AlertDescription>
                </Alert>
            }

            {clients.length === 0 ?
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                        <KeyRound className="size-8 text-muted-foreground"/>
                        <div className="max-w-md">
                            <p className="font-medium">No AI clients connected yet</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Point ChatGPT, Claude, Codex, or T3 Code at{" "}
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                                    {mcpEndpoint}
                                </code>
                                . Relay handles OAuth 2.1 discovery (DCR + CIMD) and shows your consent screen automatically.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                :
                <div className="flex flex-col gap-3">
                    {clients.map((client) => (
                        <Card key={client.clientId} size="sm">
                            <CardHeader>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <CardTitle>
                                                {client.name}
                                            </CardTitle>
                                            <Badge variant={client.mode === "code" ? "default" : "secondary"}>
                                                {client.mode === "code"
                                                    ? "Code Mode"
                                                    : "Classic MCP"
                                                }
                                            </Badge>
                                            {client.readOnly &&
                                                <Badge variant="outline">
                                                    Read-only
                                                </Badge>
                                            }
                                        </div>
                                        <CardDescription className="mt-0.5 font-mono text-xs">
                                            {client.clientId} · Connected {new Date(client.createdAt).toLocaleDateString()}
                                        </CardDescription>
                                    </div>

                                    <Button
                                        size="xs"
                                        variant="destructive"
                                        disabled={disconnectMutation.isPending}
                                        onClick={() => disconnectMutation.mutate(client.clientId)}
                                    >
                                        <Unplug/>
                                        Revoke
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent className="flex flex-col gap-3.5">
                                <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-3">
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            size="xs"
                                            variant={client.mode === "code" ? "default" : "outline"}
                                            onClick={() => policyMutation.mutate({
                                                mode: "code",
                                                clientId: client.clientId,
                                                readOnly: client.readOnly,
                                                allowedProviderIds: client.allowedProviderIds,
                                            })}
                                        >
                                            <Code2/>
                                            Code Mode
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant={client.mode === "classic" ? "default" : "outline"}
                                            onClick={() => policyMutation.mutate({
                                                mode: "classic",
                                                clientId: client.clientId,
                                                readOnly: client.readOnly,
                                                allowedProviderIds: client.allowedProviderIds,
                                            })}
                                        >
                                            <Layers/>
                                            Classic MCP
                                        </Button>
                                    </div>

                                    <label
                                        htmlFor={`client-readonly-${client.clientId}`}
                                        className="flex cursor-pointer items-center gap-2 text-xs"
                                    >
                                        <Switch
                                            size="sm"
                                            checked={client.readOnly}
                                            id={`client-readonly-${client.clientId}`}
                                            onCheckedChange={(checked) => policyMutation.mutate({
                                                mode: client.mode,
                                                readOnly: checked,
                                                clientId: client.clientId,
                                                allowedProviderIds: client.allowedProviderIds,
                                            })}
                                        />
                                        <span>Read-only tools only</span>
                                    </label>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Allowed Providers
                                    </span>
                                    {providers.length === 0 ?
                                        <p className="text-xs text-muted-foreground">
                                            Add providers first to grant access.
                                        </p>
                                        :
                                        <div className="flex flex-wrap gap-2">
                                            {providers.map((p) => {
                                                const allowed = client.allowedProviderIds.includes(p.id);

                                                return (
                                                    <label
                                                        key={p.id}
                                                        htmlFor={`allow-${client.clientId}-${p.id}`}
                                                        className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5
                                                        py-1.5 text-xs hover:bg-muted/40"
                                                    >
                                                        <Checkbox
                                                            checked={allowed}
                                                            id={`allow-${client.clientId}-${p.id}`}
                                                            onCheckedChange={(val) => toggleAllowedProvider(client, p.id, Boolean(val))}
                                                        />
                                                        <span className="font-medium">
                                                            {p.name}
                                                        </span>
                                                        <code className="font-mono text-muted-foreground">
                                                            {p.slug}
                                                        </code>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            }
        </div>
    );
}
