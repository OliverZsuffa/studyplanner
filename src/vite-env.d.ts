/// <reference types="vite/client" />

declare module '*.mjs?url' {
  const workerUrl: string;
  export default workerUrl;
}
