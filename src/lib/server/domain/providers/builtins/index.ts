import {steamBuiltInProvider} from "@/lib/server/domain/providers/builtins/steam";
import type {BuiltInProviderDefinition} from "@/lib/server/domain/providers/types";


const BUILTIN_PROVIDERS: ReadonlyMap<string, BuiltInProviderDefinition> = new Map([
    [steamBuiltInProvider.key, steamBuiltInProvider],
]);


export const listBuiltInProviders = (): BuiltInProviderDefinition[] => {
    return Array.from(BUILTIN_PROVIDERS.values());
};


export const getBuiltInProvider = (key: string): BuiltInProviderDefinition | undefined => {
    return BUILTIN_PROVIDERS.get(key);
};
