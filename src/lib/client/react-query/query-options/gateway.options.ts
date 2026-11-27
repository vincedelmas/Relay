import {queryOptions} from "@tanstack/react-query";
import {getGatewayState, getOAuthConsentRequestFn} from "@/lib/server/functions/gateway";


export const gatewayStateOptions = queryOptions({
    queryKey: ["gateway", "state"],
    queryFn: () => getGatewayState(),
});


export const oauthConsentRequestOptions = (oauthQuery: string) => queryOptions({
    queryKey: ["oauth", "consent", oauthQuery],
    queryFn: () => getOAuthConsentRequestFn({ data: { oauthQuery } }),
    staleTime: 0,
    gcTime: 0,
});
