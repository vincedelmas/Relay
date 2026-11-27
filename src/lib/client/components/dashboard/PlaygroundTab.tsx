import {type SubmitEvent, useState} from "react";
import {Badge} from "@/lib/client/components/ui/badge";
import {Input} from "@/lib/client/components/ui/input";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {Textarea} from "@/lib/client/components/ui/textarea";
import {AlertCircle, Code2, Play, Search, Terminal} from "lucide-react";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";
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


export function PlaygroundTab() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedToolId, setSelectedToolId] = useState("");
    const [callArgsText, setCallArgsText] = useState("{}");
    const [runnerMode, setRunnerMode] = useState<"execute" | "call">("execute");
    const [scriptCode, setScriptCode] = useState(DEFAULT_SCRIPT);

    const callMutation = usePlaygroundCallMutation();
    const searchMutation = usePlaygroundSearchMutation();
    const executeMutation = usePlaygroundExecuteMutation();
    const describeMutation = usePlaygroundDescribeMutation();

    const handleSearch = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        searchMutation.mutate(searchQuery);
    };

    const inspectTool = (toolId: string) => {
        setSelectedToolId(toolId);
        describeMutation.mutate(toolId);
    };

    return (
        <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5" size="sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Search className="size-4 text-brand"/>
                        FTS5 Tool Discovery
                    </CardTitle>
                    <CardDescription>
                        Test BM25 `search` and zero-dep TypeScript `describe` output.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input
                            aria-label="Search tools"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="e.g. steam playtime, recipe, or *"
                        />
                        <Button type="submit" size="sm" disabled={searchMutation.isPending}>
                            Search
                        </Button>
                    </form>

                    {searchMutation.data && (
                        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border p-1.5">
                            {searchMutation.data.tools.length === 0 ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">No matching tools found.</p>
                            ) : (
                                searchMutation.data.tools.map((hit) => (
                                    <button
                                        key={hit.id}
                                        type="button"
                                        onClick={() => inspectTool(hit.id)}
                                        className={`flex flex-col items-start rounded-md px-2.5 py-2 text-left transition-colors ${
                                            selectedToolId === hit.id
                                                ? "bg-primary/15 text-foreground"
                                                : "hover:bg-muted/60"
                                        }`}
                                    >
                                        <div className="flex w-full items-center justify-between gap-2">
                                            <code className="truncate font-mono text-xs font-medium">{hit.id}</code>
                                            {hit.readOnly && <Badge variant="outline">ro</Badge>}
                                        </div>
                                        {hit.description && (
                                            <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                                {hit.description}
                                            </span>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {describeMutation.data?.tools[0] && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">TypeScript Signature</span>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                        setRunnerMode("call");
                                        setSelectedToolId(describeMutation.data!.tools[0].id);
                                    }}
                                >
                                    Load in Call
                                </Button>
                            </div>
                            <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-2.5 font-mono text-xs leading-relaxed">
                                {describeMutation.data.tools[0].signature}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="lg:col-span-7" size="sm">
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Terminal className="size-4 text-brand"/>
                                Sandbox & Call Runner
                            </CardTitle>
                            <CardDescription>
                                Run QuickJS Code Mode scripts or single tool calls directly.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Button
                                size="xs"
                                variant={runnerMode === "execute" ? "default" : "outline"}
                                onClick={() => setRunnerMode("execute")}
                            >
                                <Code2/>
                                execute
                            </Button>
                            <Button
                                size="xs"
                                variant={runnerMode === "call" ? "default" : "outline"}
                                onClick={() => setRunnerMode("call")}
                            >
                                <Play/>
                                call
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                    {runnerMode === "execute" ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="playground-code">QuickJS Script Body</Label>
                                <Textarea
                                    id="playground-code"
                                    rows={8}
                                    value={scriptCode}
                                    onChange={(e) => setScriptCode(e.target.value)}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    disabled={executeMutation.isPending || !scriptCode.trim()}
                                    onClick={() => executeMutation.mutate(scriptCode)}
                                >
                                    <Play/>
                                    {executeMutation.isPending ? "Running..." : "Run in QuickJS"}
                                </Button>
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
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Badge variant="default">OK</Badge>
                                        <span>{executeMutation.data.durationMs}ms</span>
                                        <span>·</span>
                                        <span>{executeMutation.data.toolCallCount} tool calls</span>
                                    </div>
                                    {executeMutation.data.logs.length > 0 && (
                                        <pre className="max-h-28 overflow-auto rounded-lg border bg-muted/20 p-2 font-mono text-xs text-muted-foreground">
                                            {executeMutation.data.logs.join("\n")}
                                        </pre>
                                    )}
                                    <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-2.5 font-mono text-xs">
                                        {executeMutation.data.resultJson}
                                    </pre>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="playground-tool-id">Tool Identifier</Label>
                                <Input
                                    id="playground-tool-id"
                                    value={selectedToolId}
                                    onChange={(e) => setSelectedToolId(e.target.value)}
                                    placeholder="steam.search_store"
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="playground-call-args">Arguments (JSON)</Label>
                                <Textarea
                                    id="playground-call-args"
                                    rows={4}
                                    value={callArgsText}
                                    onChange={(e) => setCallArgsText(e.target.value)}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    disabled={callMutation.isPending || !selectedToolId.trim()}
                                    onClick={() => callMutation.mutate({ tool: selectedToolId, argsText: callArgsText })}
                                >
                                    <Play/>
                                    {callMutation.isPending ? "Calling..." : "Invoke tool"}
                                </Button>
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
                                <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-2.5 font-mono text-xs">
                                    {callMutation.data.text}
                                </pre>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
