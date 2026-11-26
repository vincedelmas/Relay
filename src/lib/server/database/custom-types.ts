import {customType} from "drizzle-orm/sqlite-core";


export const customJson = <TData>(name: string, options?: { acceptSerialized?: boolean }) => customType<{ data: TData; driverData: string }>({
    dataType() {
        return "text";
    },
    toDriver(value: TData | string) {
        // Better Auth serializes SQLite JSON before handing it to Drizzle.
        if (options?.acceptSerialized && typeof value === "string") return value;
        return JSON.stringify(value);
    },
    fromDriver(value: string): TData {
        return JSON.parse(value);
    },
})(name);
