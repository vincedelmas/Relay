import {db} from "@/lib/server/database/db";
import {createServerEntry, createStartHandler, defaultStreamHandler} from "@tanstack/react-start/server";


export default {
    ...createServerEntry({ fetch: createStartHandler(defaultStreamHandler) }),
    async closeResources() {
        db.$client.close();
    },
};
