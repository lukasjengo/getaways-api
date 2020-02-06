declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: 'development' | 'production';
    PORT: string;
    DATABASE: string;
    DATABASE_PASSWORD: string;
  }
}
