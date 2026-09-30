"""Probabilistic Evaluation Metrics.

Computes multi-dimensional probabilistic validation metrics specified in TECH_STACK.md §5:
  - Brier score (multi-class and one-vs-rest per category)
  - Multi-class Log Loss
  - Expected Calibration Error (ECE) & Reliability bins
  - ROC-AUC (One-vs-Rest macro/micro)
  - Confusion Matrix & Per-Class Precision / Recall / F1
  - Lead-time specific breakdown (week_1 through week_4)
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    log_loss,
    precision_recall_fscore_support,
    roc_auc_score,
)


def compute_probabilistic_metrics(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    meta_rows: Optional[Sequence[dict[str, Any]]] = None,
    num_classes: int = 4,
) -> dict[str, Any]:
    """Compute comprehensive probabilistic validation metrics.
    
    Args:
        y_true: Ground-truth class labels (N,) in [0, 1, 2, 3]
        y_prob: Predicted probability matrix (N, num_classes)
        meta_rows: Optional metadata containing 'lead_week'
        num_classes: Number of discrete weather states (default 4)
    """
    if len(y_true) == 0 or len(y_prob) == 0:
        return {"error": "Empty dataset"}

    class_names = ["active", "onset", "break", "heavy"]
    n_samples = len(y_true)

    # 1. Brier Scores
    brier_scores: dict[str, float] = {}
    sum_brier = 0.0
    for idx, cname in enumerate(class_names):
        y_bin = (y_true == idx).astype(int)
        p_c = y_prob[:, idx]
        # Handle cases with single class
        if len(np.unique(y_bin)) >= 1:
            bs = float(np.mean((p_c - y_bin) ** 2))
            brier_scores[f"brier_{cname}"] = round(bs, 4)
            sum_brier += bs

    brier_multi = round(sum_brier / num_classes, 4)

    # 2. Multi-class Log Loss
    # Clip probabilities for numerical stability
    p_clipped = np.clip(y_prob, 1e-6, 1.0 - 1e-6)
    p_clipped /= p_clipped.sum(axis=1, keepdims=True)
    try:
        overall_log_loss = round(float(log_loss(y_true, p_clipped, labels=list(range(num_classes)))), 4)
    except Exception:
        overall_log_loss = float("nan")

    # 3. Expected Calibration Error (ECE)
    # 10 bins between 0 and 1
    bins = np.linspace(0.0, 1.0, 11)
    ece = 0.0
    reliability_curve: list[dict[str, float]] = []

    confidences = np.max(y_prob, axis=1)
    predictions = np.argmax(y_prob, axis=1)
    accuracies = (predictions == y_true)

    for i in range(len(bins) - 1):
        bin_lower, bin_upper = bins[i], bins[i + 1]
        in_bin = (confidences >= bin_lower) & (confidences < bin_upper)
        bin_size = np.sum(in_bin)
        if bin_size > 0:
            bin_acc = float(np.mean(accuracies[in_bin]))
            bin_conf = float(np.mean(confidences[in_bin]))
            ece += (bin_size / n_samples) * abs(bin_acc - bin_conf)
            reliability_curve.append({
                "bin_mid": round((bin_lower + bin_upper) / 2.0, 3),
                "accuracy": round(bin_acc, 4),
                "confidence": round(bin_conf, 4),
                "count": int(bin_size),
            })

    # 4. ROC-AUC (One-vs-Rest)
    auc_scores: dict[str, float] = {}
    try:
        # Check if multiple classes are represented in y_true
        if len(np.unique(y_true)) > 1:
            for idx, cname in enumerate(class_names):
                y_bin = (y_true == idx).astype(int)
                if len(np.unique(y_bin)) == 2:
                    auc_scores[f"auc_{cname}"] = round(float(roc_auc_score(y_bin, y_prob[:, idx])), 4)
            macro_auc = round(float(roc_auc_score(y_true, y_prob, multi_class="ovr")), 4)
        else:
            macro_auc = float("nan")
    except Exception:
        macro_auc = float("nan")

    # 5. Confusion Matrix & Per-Class Precision / Recall / F1
    pred_classes = np.argmax(y_prob, axis=1)
    cm = confusion_matrix(y_true, pred_classes, labels=list(range(num_classes)))
    prec, rec, f1, _ = precision_recall_fscore_support(
        y_true, pred_classes, labels=list(range(num_classes)), zero_division=0
    )

    per_class_stats: dict[str, dict[str, float]] = {}
    for idx, cname in enumerate(class_names):
        per_class_stats[cname] = {
            "precision": round(float(prec[idx]), 4),
            "recall": round(float(rec[idx]), 4),
            "f1_score": round(float(f1[idx]), 4),
        }

    # 6. Lead-Time Specific Metrics (week_1 through week_4)
    lead_metrics: dict[str, dict[str, float]] = {}
    if meta_rows and len(meta_rows) == n_samples:
        for lead_w in range(1, 5):
            lead_key = f"week_{lead_w}"
            mask = np.array([m.get("lead_week") == lead_w for m in meta_rows])
            if np.sum(mask) > 0:
                y_t_lead = y_true[mask]
                y_p_lead = y_prob[mask]
                bs_lead = float(np.mean([np.mean((y_p_lead[:, c] - (y_t_lead == c)) ** 2) for c in range(num_classes)]))
                acc_lead = float(np.mean(np.argmax(y_p_lead, axis=1) == y_t_lead))
                lead_metrics[lead_key] = {
                    "brier_score": round(bs_lead, 4),
                    "accuracy": round(acc_lead, 4),
                    "samples": int(np.sum(mask)),
                }

    overall_acc = round(float(np.mean(pred_classes == y_true)), 4)

    return {
        "sample_count": n_samples,
        "accuracy": overall_acc,
        "brier_score_multi": brier_multi,
        "brier_scores_per_class": brier_scores,
        "log_loss": overall_log_loss,
        "expected_calibration_error": round(float(ece), 4),
        "reliability_curve": reliability_curve,
        "roc_auc_macro": macro_auc,
        "roc_auc_per_class": auc_scores,
        "confusion_matrix": cm.tolist(),
        "per_class_performance": per_class_stats,
        "lead_time_performance": lead_metrics,
    }
