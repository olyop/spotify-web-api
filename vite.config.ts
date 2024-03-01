import { readFile } from "node:fs/promises";

import reactSwc from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import checker from "vite-plugin-checker";

const checkerOptions: Parameters<typeof checker>[0] = {
	typescript: true,
	eslint: {
		lintCommand: "eslint",
	},
};

export type Mode = "development" | "production";

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace NodeJS {
		// eslint-disable-next-line unicorn/prevent-abbreviations
		interface ProcessEnv {
			TLS_CERT_PATH: string;
			TLS_KEY_PATH: string;
		}
	}
}

export default defineConfig(async options => {
	const mode = options.mode as Mode;

	const environmentVariables = loadEnv(mode, process.cwd(), "");

	process.env = { ...process.env, ...environmentVariables };

	return {
		plugins: [reactSwc(), checker(checkerOptions)],
		server: {
			host: true,
			https: {
				cert: await readFile(process.env.TLS_CERT_PATH),
				key: await readFile(process.env.TLS_KEY_PATH),
			},
		},
	};
});
