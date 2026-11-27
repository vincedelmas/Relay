import {Activity, Trash2} from "lucide-react";
import {useMutation} from "@tanstack/react-query";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {clearLogsFn} from "@/lib/server/functions/gateway";
import {Card, CardContent} from "@/lib/client/components/ui/card";
import type {GatewayLog} from "@/lib/client/components/dashboard/types";


interface LogsTabProps {
    logs: GatewayLog[];
    onChanged: () => Promise<void>;
}


export function LogsTab({ logs, onChanged }: LogsTabProps) {
    const clearMutation = useMutation({
        mutationFn: () => clearLogsFn(),
        onSuccess: async () => {
            await onChanged();
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-medium">
                        Execution Audit Log
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Every `call` and QuickJS `execute` run across all connected AI clients and the playground.
                    </p>
                </div>
                {logs.length > 0 &&
                    <Button size="xs" variant="outline" disabled={clearMutation.isPending} onClick={() => clearMutation.mutate()}>
                        <Trash2/>
                        Clear logs
                    </Button>
                }
            </div>

            {logs.length === 0 ?
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                        <Activity className="size-8 text-muted-foreground"/>
                        <p className="font-medium">
                            No executions recorded yet
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Tool calls and Code Mode script executions will appear here with timing and error details.
                        </p>
                    </CardContent>
                </Card>
                :
                <div className="flex flex-col gap-2">
                    {logs.map((entry) =>
                        <Card key={entry.id} size="sm">
                            <CardContent className="flex flex-col gap-2 py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={entry.status === "ok" ? "default" : "destructive"}>
                                            {entry.status}
                                        </Badge>
                                        <Badge variant="outline">
                                            {entry.kind}
                                        </Badge>
                                        <span className="font-mono text-xs font-medium">
                                            {entry.kind === "call"
                                                ? `${entry.providerSlug ?? "?"}.${entry.toolName ?? "?"}`
                                                : `QuickJS (${entry.toolCallCount} calls)`
                                            }
                                        </span>
                                        {entry.clientName &&
                                            <Badge variant="secondary">
                                                {entry.clientName}
                                            </Badge>
                                        }
                                    </div>
                                    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                                        <span>{entry.durationMs}ms</span>
                                        <span>·</span>
                                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>

                                {entry.code &&
                                    <pre className="max-h-24 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
                                        {entry.code}
                                    </pre>
                                }

                                {entry.errorMessage &&
                                    <p className="break-all font-mono text-xs text-destructive">
                                        {entry.errorMessage}
                                    </p>
                                }
                            </CardContent>
                        </Card>
                    )}
                </div>
            }
        </div>
    );
}
