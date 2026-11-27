import type {getGatewayState} from "@/lib/server/functions/gateway";


type GatewayState = Awaited<ReturnType<typeof getGatewayState>>;


export type GatewayLog = GatewayState["logs"][number];
export type GatewayClient = GatewayState["clients"][number];
export type GatewayBuiltIn = GatewayState["builtins"][number];
export type GatewayProvider = GatewayState["providers"][number];
