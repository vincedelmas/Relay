import {authClient} from "@/lib/client/auth-client";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {gatewayStateOptions} from "@/lib/client/react-query/query-options/gateway.options";
import type {ProviderAuthType, ProviderKind} from "@/lib/types/gateway.types";
import {
    clearLogsFn,
    createProviderFn,
    deleteProviderFn,
    disconnectClientFn,
    disconnectProviderOAuthFn,
    playgroundCallFn,
    playgroundExecuteFn,
    saveClientPolicyFn,
    startProviderOAuthFn,
    syncProviderFn,
    toggleProviderToolFn,
    updateProviderFn,
} from "@/lib/server/functions/gateway";


export const useCreateProviderMutation = (onSuccess?: () => void) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            name: string;
            slug?: string;
            url?: string;
            kind: ProviderKind;
            readOnly?: boolean;
            authSecret?: string;
            builtinKey?: string;
            authType?: ProviderAuthType;
            config?: Record<string, string>;
        }) => createProviderFn({ data }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey });
            onSuccess?.();
        },
    });
};


export const useUpdateProviderMutation = (onSuccess?: () => void) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            id: string;
            name?: string;
            enabled?: boolean;
            readOnly?: boolean;
            url?: string;
            authType?: ProviderAuthType;
            authSecret?: string;
            config?: Record<string, string>;
        }) => updateProviderFn({ data }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey });
            onSuccess?.();
        },
    });
};


export const useDeleteProviderMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteProviderFn({ data: { id } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useSyncProviderMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => syncProviderFn({ data: { id } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useStartProviderOAuthMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => startProviderOAuthFn({ data: { id } }),
        onSuccess: async (res, id) => {
            if (res.authorizationUrl) {
                window.location.assign(res.authorizationUrl);
                return;
            }
            if (res.alreadyAuthorized) {
                await syncProviderFn({ data: { id } });
                await queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey });
            }
        },
    });
};


export const useDisconnectProviderOAuthMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => disconnectProviderOAuthFn({ data: { id } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useToggleProviderToolMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { toolId: string; enabled: boolean }) => toggleProviderToolFn({ data }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useSaveClientPolicyMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            clientId: string;
            readOnly?: boolean;
            allowedProviderIds?: string[];
            toggleProvider?: { providerId: string; allowed: boolean };
        }) => saveClientPolicyFn({ data }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useDisconnectClientMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (clientId: string) => disconnectClientFn({ data: { clientId } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useOAuthConsentMutation = (params: {
    clientId: string;
    oauthQuery: string;
    readOnly: boolean;
    allowedProviderIds: string[];
}) => {
    return useMutation({
        mutationFn: async (accept: boolean) => {
            const { data, error } = await authClient.oauth2.consent({
                accept,
                oauth_query: params.oauthQuery,
            });
            if (error) throw new Error(error.message || "Consent request failed.");

            if (accept) {
                await saveClientPolicyFn({
                    data: {
                        clientId: params.clientId,
                        readOnly: params.readOnly,
                        allowedProviderIds: params.allowedProviderIds,
                    },
                });
            }

            return data;
        },
        onSuccess: (data) => {
            window.location.assign(data.url);
        },
    });
};


export const usePlaygroundCallMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { tool: string; argsText: string }) => {
            const parsed = JSON.parse(input.argsText || "{}") as Record<string, unknown>;
            return playgroundCallFn({ data: { tool: input.tool, args: parsed } });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const usePlaygroundExecuteMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (code: string) => playgroundExecuteFn({ data: { code } }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};


export const useClearLogsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => clearLogsFn(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: gatewayStateOptions.queryKey }),
    });
};
