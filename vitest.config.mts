import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      {
        find: /^jsr:@supabase\/supabase-js@2$/,
        replacement: "@supabase/supabase-js",
      },
      {
        find: /^jsr:@supabase\/functions-js\/edge-runtime\.d\.ts$/,
        replacement: fileURLToPath(
          new URL(
            "./supabase/functions/.test-support/edge-runtime-stub.ts",
            import.meta.url,
          ),
        ),
      },
    ],
  },
});
