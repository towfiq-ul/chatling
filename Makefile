.PHONY: help install build typecheck lint format test test-e2e check clean \
	worker-dev worker-deploy worker-tail worker-secrets worker-typegen \
	example-vanilla example-react publish-dry-run publish

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies for every workspace
	npm install

build: ## Build all workspaces (tsup for widget, tsc --noEmit for worker)
	npm run build

typecheck: ## tsc --noEmit per workspace
	npm run typecheck

lint: ## Biome check (lint + format check), no writes
	npm run lint

format: ## Biome check --write — fixes formatting in place
	npm run format

test: ## Unit tests (Vitest) across workspaces
	npm test

test-e2e: ## Playwright E2E, against a real wrangler dev instance
	npm run test:e2e

check: typecheck lint test ## Everything short of E2E — run before committing

clean: ## Remove build output and installed deps everywhere
	rm -rf node_modules dist packages/*/node_modules packages/*/dist \
		packages/*/.wrangler examples/*/node_modules examples/*/dist \
		test-results playwright-report

worker-dev: ## Run the Worker locally (wrangler dev, default :8787)
	cd packages/worker && npm run dev

worker-deploy: ## Deploy the Worker to your Cloudflare account
	cd packages/worker && npm run deploy

worker-tail: ## Stream live logs from the deployed Worker
	cd packages/worker && npm run tail

worker-secrets: ## Set the three required Worker secrets (interactive prompts)
	cd packages/worker && \
		wrangler secret put AI_API_KEY && \
		wrangler secret put AI_BASE_URL && \
		wrangler secret put AI_MODEL

worker-typegen: ## Regenerate worker-configuration.d.ts from wrangler.jsonc
	cd packages/worker && npm run cf-typegen

example-vanilla: ## Serve the repo root so the vanilla example's dist/ path resolves
	@echo "Open http://localhost:3000/examples/vanilla/index.html"
	npx serve .

example-react: ## Run the React example's Vite dev server
	cd examples/react && npm run dev

publish-dry-run: ## Build the widget and preview what `npm publish` would ship
	cd packages/widget && npm run build && npm publish --dry-run

publish: ## Build and publish the widget package to npm (requires npm login)
	cd packages/widget && npm run build && npm publish
