"""
Agent package initialization.

Eager imports are omitted from this package root to avoid circular dependency
cycles during evaluation/test discovery (e.g. sources.population -> agent.corridor ->
agent -> agent.fetcher -> sources.population).
Consumers should import directly from the relevant submodules:
- agent.corridor
- agent.fetcher
- agent.compute
- agent.reason
- agent.verify
- agent.run
"""

__all__ = []


