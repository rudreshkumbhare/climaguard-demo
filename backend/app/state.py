"""
state.py — Application-level singleton data store.

Loads the road graph, facilities and zones exactly once at startup,
precomputes cascade baselines, and exposes an AppState instance that
FastAPI route handlers receive via dependency injection.

Usage in a route:
    from .state import get_app_state, AppState

    @router.get("/health")
    def health(state: AppState = Depends(get_app_state)):
        ...
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Annotated

from fastapi import Depends

from .flood import load_data
from .cascade import precompute_baselines

# ── Module-level singleton ─────────────────────────────────────────────────────
_app_state: SimpleNamespace | None = None


def init_app_state() -> SimpleNamespace:
    """
    Load data from disk and precompute cascade baselines.
    Must be called exactly once during FastAPI lifespan startup.
    Returns the SimpleNamespace that all routes will share.
    """
    global _app_state
    data = load_data()
    precompute_baselines(data)
    _app_state = data
    return data


def get_app_state() -> SimpleNamespace:
    """
    FastAPI dependency: returns the pre-loaded application state.
    Raises RuntimeError if called before init_app_state().
    """
    if _app_state is None:
        raise RuntimeError("App state not initialised. Call init_app_state() first.")
    return _app_state


# Typed alias for use in route signatures
AppState = Annotated[SimpleNamespace, Depends(get_app_state)]
