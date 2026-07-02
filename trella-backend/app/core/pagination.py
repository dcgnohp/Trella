def clamp_limit(limit: int, max_limit: int) -> int:
    return max(1, min(limit, max_limit))
