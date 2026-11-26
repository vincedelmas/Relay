import {clientEnv} from "@/env/client";
import {createAuthClient} from "better-auth/react";
import {oauthProviderClient} from "@better-auth/oauth-provider/client";


export const authClient = createAuthClient({
    baseURL: clientEnv.VITE_BASE_URL,
    plugins: [oauthProviderClient()],
});
