import { existsSync } from 'node:fs';

/**
 * The supplied game worktrees keep TypeScript source-only artifacts. This
 * local harness uses Node's built-in type transform and resolves their
 * extensionless or emitted-.js source imports without installing a loader.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.') || !context.parentURL) throw error;
    const requested = new URL(specifier, context.parentURL);
    const candidates = [];
    if (requested.pathname.endsWith('.js')) {
      candidates.push(new URL(requested.href.slice(0, -3) + '.ts'));
      candidates.push(new URL(requested.href.slice(0, -3) + '.mts'));
    } else if (!/\.[a-z]+$/i.test(requested.pathname)) {
      candidates.push(new URL(`${requested.href}.ts`));
      candidates.push(new URL(`${requested.href}.mts`));
      candidates.push(new URL(`${requested.href}.tsx`));
    }
    for (const candidate of candidates) {
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    throw error;
  }
}
