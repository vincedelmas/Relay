import * as z from "zod";
import {createEnv} from "@t3-oss/env-core";


export const clientEnv = createEnv({
    clientPrefix: "VITE_",
    runtimeEnv: import.meta.env,
    emptyStringAsUndefined: true,
    client: {
        VITE_BASE_URL: z.url().default("http://localhost:3000"),
    },
});
