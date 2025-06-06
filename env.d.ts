// env.d.ts
namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: "development" | "production" | "test";
        DATABASE_URL: string;
    }
}
