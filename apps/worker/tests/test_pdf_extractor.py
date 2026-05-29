import unittest

from services.pdf_extractor import find_text_bbox, _validate_bbox


class FindTextBboxTest(unittest.TestCase):
    def test_finds_bbox_for_matching_word_sequence(self):
        words = [
            {"text": "납품", "x0": 10, "top": 20, "x1": 35, "bottom": 30},
            {"text": "지연", "x0": 40, "top": 20, "x1": 65, "bottom": 30},
            {"text": "시", "x0": 70, "top": 20, "x1": 82, "bottom": 30},
        ]

        bbox, next_index = find_text_bbox("납품 지연 시", words)

        self.assertEqual(bbox, [10.0, 20.0, 82.0, 30.0])
        self.assertEqual(next_index, 3)

    def test_respects_start_index_for_repeated_text(self):
        words = [
            {"text": "계약", "x0": 1, "top": 1, "x1": 10, "bottom": 5},
            {"text": "조건", "x0": 11, "top": 1, "x1": 20, "bottom": 5},
            {"text": "계약", "x0": 1, "top": 10, "x1": 10, "bottom": 15},
            {"text": "조건", "x0": 11, "top": 10, "x1": 20, "bottom": 15},
        ]

        bbox, next_index = find_text_bbox("계약 조건", words, start_index=2)

        self.assertEqual(bbox, [1.0, 10.0, 20.0, 15.0])
        self.assertEqual(next_index, 4)

    def test_returns_none_when_text_is_not_found(self):
        bbox, next_index = find_text_bbox(
            "없는 문장",
            [{"text": "다른", "x0": 1, "top": 1, "x1": 10, "bottom": 5}],
            start_index=0,
        )

        self.assertIsNone(bbox)
        self.assertEqual(next_index, 0)


class ValidateBboxTest(unittest.TestCase):
    PAGE_W = 612.0
    PAGE_H = 792.0

    def test_valid_bbox_passes_through(self):
        bbox = _validate_bbox([72.0, 100.0, 540.0, 120.0], self.PAGE_W, self.PAGE_H)
        self.assertEqual(bbox, [72.0, 100.0, 540.0, 120.0])

    def test_none_returns_none(self):
        self.assertIsNone(_validate_bbox(None, self.PAGE_W, self.PAGE_H))

    def test_inverted_x_returns_none(self):
        # x0 >= x1
        self.assertIsNone(_validate_bbox([200.0, 100.0, 100.0, 120.0], self.PAGE_W, self.PAGE_H))

    def test_inverted_y_returns_none(self):
        # y0 >= y1
        self.assertIsNone(_validate_bbox([72.0, 120.0, 540.0, 100.0], self.PAGE_W, self.PAGE_H))

    def test_out_of_bounds_is_clamped(self):
        # x1 > page_width, y1 > page_height
        bbox = _validate_bbox([0.0, 0.0, 700.0, 900.0], self.PAGE_W, self.PAGE_H)
        self.assertEqual(bbox, [0.0, 0.0, self.PAGE_W, self.PAGE_H])

    def test_negative_coordinates_are_clamped(self):
        bbox = _validate_bbox([-10.0, -5.0, 100.0, 50.0], self.PAGE_W, self.PAGE_H)
        self.assertEqual(bbox, [0.0, 0.0, 100.0, 50.0])

    def test_zero_area_after_clamp_returns_none(self):
        # bbox 전체가 페이지 밖 → 클램핑 후 면적 0
        self.assertIsNone(_validate_bbox([700.0, 800.0, 750.0, 850.0], self.PAGE_W, self.PAGE_H))

    def test_wrong_length_returns_none(self):
        self.assertIsNone(_validate_bbox([1.0, 2.0, 3.0], self.PAGE_W, self.PAGE_H))  # type: ignore


if __name__ == "__main__":
    unittest.main()
