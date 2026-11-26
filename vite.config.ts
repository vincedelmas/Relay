import path from "path";
import {defineConfig} from "vite";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import {tanstackStart} from "@tanstack/react-start/plugin/vite";
import react, {reactCompilerPreset} from "@vitejs/plugin-react";


export default defineConfig({
    resolve: {
        tsconfigPaths: true,
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
    plugins: [
        tanstackStart({
            spa: {
                enabled: true,
            },
            router: {
                semicolons: true,
                quoteStyle: "double",
                codeSplittingOptions: {
                    defaultBehavior: [
                        [
                            "component",
                            "pendingComponent",
                            "errorComponent",
                            "notFoundComponent",
                            "loader",
                        ],
                    ],
                },
            },
        }),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        tailwindcss(),
    ],
});
