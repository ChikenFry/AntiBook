"""
Unit tests for the pure hook-generation functions in hooks.py.
No FastAPI, no Docling, no network — just logic.
"""
import pytest
from hooks import _is_body_paragraph, _score_hook_sentence, internalHeuristicGenerator, MIN_HOOK_SCORE

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_paragraphs(n: int, page_start: int = 1) -> list:
    """Generate n well-formed body paragraphs spread across pages."""
    prose = (
        "The human mind is a remarkable instrument that has evolved over millions of years. "
        "It processes information, creates meaning, and allows us to understand the world around us. "
        "Without this capacity for understanding, human civilization would be impossible to sustain. "
        "Knowledge transforms the way we perceive reality and shapes our every decision."
    )
    return [{"text": prose, "page_no": page_start + i} for i in range(n)]


# ─────────────────────────────────────────────────────────────────────────────
# _is_body_paragraph
# ─────────────────────────────────────────────────────────────────────────────

class TestIsBodyParagraph:
    def test_accepts_genuine_prose(self):
        text = (
            "The greatest challenge of our time is learning to live with uncertainty. "
            "Human beings crave certainty, yet the world offers little of it. "
            "Those who master uncertainty gain a profound advantage over those who fear it. "
            "Understanding this truth changes how we approach every decision we make in life."
        )
        assert _is_body_paragraph(text) is True

    def test_rejects_numbered_reference_list(self):
        text = (
            "[1] Smith, J. The Nature of Complexity. MIT Press, 2020.\n"
            "[2] Jones, K. Understanding Systems. Oxford, 2019.\n"
            "[3] Brown, R. Modern Approaches. Penguin, 2018.\n"
            "[4] Davis, L. Foundations of Theory. Harvard, 2017."
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_bibliography_entry(self):
        text = (
            "Smith, J., & Jones, K. (2019). The complete guide to machine learning. "
            "Journal of AI Research, 15(3), 45-67. doi:10.1234/jair.2019.15.3.45"
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_too_many_year_citations(self):
        text = (
            "Prior research (Anderson, 2018) suggested that cognitive load (Smith, 2015) "
            "plays a significant role in decision-making (Johnson, 2020). "
            "These findings were later replicated (Brown, 2021) in multiple contexts. "
            "The implications remain contested in the literature to this day."
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_too_short(self):
        text = "This paragraph is far too short to be meaningful prose worth quoting."
        assert _is_body_paragraph(text) is False

    def test_rejects_only_one_sentence(self):
        # Enough words but no sentence variety
        text = "word " * 45
        assert _is_body_paragraph(text) is False

    def test_rejects_acknowledgments_opener(self):
        text = (
            "Acknowledgments: The author would like to thank the many colleagues and friends "
            "who contributed to this work over many years of research and collaboration. "
            "Without their support, this project would never have been completed. "
            "Special thanks to the editorial team for their invaluable feedback."
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_bibliography_section_opener(self):
        text = (
            "Bibliography: The following works were consulted during the preparation of this "
            "manuscript. Readers interested in further details are encouraged to consult these "
            "primary sources directly. The list is organized alphabetically by author surname."
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_figure_caption(self):
        text = (
            "Figure 3: Illustration of the primary feedback loop showing how information "
            "flows between the core components of the system under normal operating conditions. "
            "Each arrow represents a directional data flow with latency measured in milliseconds. "
            "Values shown are averages taken over a 30-day monitoring window in production."
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_high_digit_density(self):
        # Lots of numbers — data / statistics block
        text = (
            "The results show 42.3% improvement over baseline. Group A: 87, 92, 45, 63, 71. "
            "Group B: 34, 56, 89, 23, 47, 91. Mean = 62.1, SD = 18.4, p < 0.001. "
            "Table 2 shows 1234, 5678, 9012, 3456, 7890 across all 48 conditions tested. "
            "Confidence intervals: 95% CI [44.2, 80.0]. N = 2048 participants in total."
        )
        assert _is_body_paragraph(text) is False

    def test_rejects_toc_style_lines(self):
        text = (
            "Chapter One: The Beginning .......... 1\n"
            "Chapter Two: The Middle ............. 45\n"
            "Chapter Three: The End .............. 89\n"
            "Appendix A: Data Tables ............. 134"
        )
        assert _is_body_paragraph(text) is False


# ─────────────────────────────────────────────────────────────────────────────
# _score_hook_sentence
# ─────────────────────────────────────────────────────────────────────────────

class TestScoreHookSentence:
    def test_punchy_declarative_scores_high(self):
        s = "The greatest mistake you can make is to be afraid of making one."
        assert _score_hook_sentence(s) >= MIN_HOOK_SCORE

    def test_rhetorical_question_scores_high(self):
        s = "What does it truly mean to understand another human being?"
        assert _score_hook_sentence(s) >= MIN_HOOK_SCORE
        # Questions get explicit +2.5 bonus
        assert _score_hook_sentence(s) > _score_hook_sentence(
            "Understanding another human being is a complex and rewarding process."
        )

    def test_dangling_pronoun_penalised(self):
        # Pronoun opener cancels the length bonus — stays below the emission threshold
        s = "He walked into the room and knew immediately that something was wrong."
        assert _score_hook_sentence(s) < MIN_HOOK_SCORE

    def test_transition_opener_penalised(self):
        for opener in ["However, ", "Therefore, ", "Nevertheless, ", "But "]:
            s = opener + "this approach has several significant drawbacks worth considering carefully."
            assert _score_hook_sentence(s) < MIN_HOOK_SCORE

    def test_numeric_opener_penalised(self):
        # Numeric opener cancels most of the length bonus — stays below emission threshold
        assert _score_hook_sentence("42 participants completed the study over six weeks.") < MIN_HOOK_SCORE

    def test_url_heavily_penalised(self):
        assert _score_hook_sentence("Visit https://example.com for more information about this.") < 0

    def test_citation_penalised(self):
        assert _score_hook_sentence("Smith (2019) argued that the theory was fundamentally flawed.") < MIN_HOOK_SCORE

    def test_too_short_returns_minimum(self):
        assert _score_hook_sentence("Too short.") == -99.0

    def test_high_value_vocab_boosts_score(self):
        base = "Knowledge is the foundation of all human progress."
        boosted = "True knowledge and freedom are the greatest achievements of the human mind."
        assert _score_hook_sentence(boosted) > _score_hook_sentence(base)

    def test_sweet_spot_length_preferred(self):
        short = "Read more."
        ideal = "Reading rewires the brain in ways that make us more empathetic and wise."
        very_long = ("Reading is an activity that has been shown across decades of research to "
                     "have profound effects on many aspects of cognitive function including empathy "
                     "and emotional intelligence in both children and adults of all backgrounds.")
        assert _score_hook_sentence(ideal) > _score_hook_sentence(short)
        assert _score_hook_sentence(ideal) > _score_hook_sentence(very_long)


# ─────────────────────────────────────────────────────────────────────────────
# internalHeuristicGenerator
# ─────────────────────────────────────────────────────────────────────────────

class TestInternalHeuristicGenerator:
    def test_empty_input_returns_empty(self):
        assert internalHeuristicGenerator([], "book1", 100) == []

    def test_returns_list_of_dicts_with_required_keys(self):
        paras = make_paragraphs(30, page_start=5)
        results = internalHeuristicGenerator(paras, "book1", 30)
        assert isinstance(results, list)
        for item in results:
            assert "hook" in item
            assert "paragraph" in item
            assert "paragraph_id" in item

    def test_hook_is_non_empty_string(self):
        paras = make_paragraphs(20, page_start=3)
        results = internalHeuristicGenerator(paras, "book1", 20)
        for item in results:
            assert isinstance(item["hook"], str)
            assert len(item["hook"]) > 0

    def test_scales_with_page_count_small_book(self):
        # 15 pages → n_target = max(5, 15//3) = 5
        paras = make_paragraphs(20, page_start=1)
        results = internalHeuristicGenerator(paras, "b", 15)
        assert len(results) <= 5

    def test_scales_with_page_count_medium_book(self):
        # 50 pages → n_target = max(5, 50//3) = 16
        paras = make_paragraphs(60, page_start=5)
        results = internalHeuristicGenerator(paras, "b", 50)
        assert len(results) >= 5   # at least floor
        assert len(results) <= 16  # at most target

    def test_cap_at_30_for_large_book(self):
        # 300 pages → n_target = min(30, 300//3) = 30
        paras = make_paragraphs(200, page_start=30)
        results = internalHeuristicGenerator(paras, "b", 300)
        assert len(results) <= 30

    def test_no_hook_below_quality_threshold(self):
        # All paragraphs contain only dangling-pronoun sentences → should produce 0 hooks
        bad_para = (
            "He said this. She agreed with him. They decided to move forward. "
            "It was unclear what they meant. We could not determine the outcome."
        )
        paras = [{"text": bad_para, "page_no": i} for i in range(1, 30)]
        results = internalHeuristicGenerator(paras, "b", 30)
        # All sentences start with pronouns (score < 0), so nothing clears MIN_HOOK_SCORE
        assert len(results) == 0

    def test_paragraph_id_is_string_page_number(self):
        paras = make_paragraphs(10, page_start=7)
        results = internalHeuristicGenerator(paras, "b", 10)
        for item in results:
            pid = item["paragraph_id"]
            assert isinstance(pid, str)
            assert pid.isdigit()
            assert int(pid) >= 7

    def test_single_paragraph_fallback(self):
        # Even a single paragraph should not crash
        paras = [{"text": make_paragraphs(1)[0]["text"], "page_no": 5}]
        results = internalHeuristicGenerator(paras, "b", 5)
        assert isinstance(results, list)
