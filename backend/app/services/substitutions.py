"""Substitution dictionary utilities."""

import re
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.substitution import SubstitutionRule


def apply_substitutions(text: str, rules: List["SubstitutionRule"]) -> tuple[str, int]:
    """Apply enabled substitution rules to text.

    Returns (substituted_text, count_of_rules_that_matched).
    """
    rules_applied = 0
    for rule in rules:
        if not rule.is_enabled:
            continue
        pattern = re.escape(rule.original)
        if rule.is_whole_word:
            pattern = r"(?<!\w)" + pattern + r"(?!\w)"
        flags = re.UNICODE
        if not rule.is_case_sensitive:
            flags |= re.IGNORECASE
        new_text, n = re.subn(pattern, rule.replacement, text, flags=flags)
        if n > 0:
            text = new_text
            rules_applied += 1
    return text, rules_applied
