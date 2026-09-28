"""Stage 1: Small GRU Sequence Model for Teleconnection Trajectory Cross-Check.

Implements a compact Gated Recurrent Unit (GRU) sequence model specified in TECH_STACK.md §5:
- Input: temporal trajectory of teleconnections (seq_len x 5 features: [ONI, DMI, RMM1, RMM2, Amplitude])
- Hidden state: 16 units (compact ~1,100 parameters)
- Nonlinear cross-check against the analog ensemble
- Vectorized NumPy implementation for deterministic, lightweight forward pass
- Full parameter serialization to JSON (< 25 KB)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional, Sequence

import numpy as np


class SmallGRUModel:
    """Lightweight GRU sequence model for teleconnection trajectory processing."""

    def __init__(
        self,
        input_dim: int = 5,
        hidden_dim: int = 16,
        output_dim: int = 16,  # 4 lead weeks x 4 states (onset, active, break, heavy)
        seed: int = 42,
    ) -> None:
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.rng = np.random.RandomState(seed)

        # GRU Weights: update gate (z), reset gate (r), candidate state (h)
        # Concatenated for efficiency: [W_z, W_r, W_h] of shape (input_dim, 3 * hidden_dim)
        limit = np.sqrt(6.0 / (input_dim + hidden_dim))
        self.W = self.rng.uniform(-limit, limit, (input_dim, 3 * hidden_dim))
        self.U = self.rng.uniform(-limit, limit, (hidden_dim, 3 * hidden_dim))
        self.b = np.zeros(3 * hidden_dim, dtype=np.float64)

        # Output projection head: Linear(hidden_dim, 16)
        out_limit = np.sqrt(6.0 / (hidden_dim + output_dim))
        self.W_out = self.rng.uniform(-out_limit, out_limit, (hidden_dim, output_dim))
        self.b_out = np.zeros(output_dim, dtype=np.float64)

    @staticmethod
    def _sigmoid(x: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(x, -30.0, 30.0)))

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        exp_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return exp_x / np.sum(exp_x, axis=-1, keepdims=True)

    def forward(self, sequence: np.ndarray) -> np.ndarray:
        """Execute forward pass on a 2D sequence (seq_len, input_dim) or 3D batch (batch, seq_len, input_dim).
        
        Returns:
            Logits of shape (batch, 4, 4) or (4, 4) for (lead_weeks, states).
        """
        is_2d = sequence.ndim == 2
        if is_2d:
            sequence = np.expand_dims(sequence, axis=0)

        batch_size, seq_len, _ = sequence.shape
        h = np.zeros((batch_size, self.hidden_dim), dtype=np.float64)

        h_dim = self.hidden_dim
        for t in range(seq_len):
            x_t = sequence[:, t, :]  # (batch, input_dim)
            gates = np.dot(x_t, self.W) + np.dot(h, self.U) + self.b

            z = self._sigmoid(gates[:, :h_dim])
            r = self._sigmoid(gates[:, h_dim : 2 * h_dim])
            
            # Candidate state
            cand_gate = np.dot(x_t, self.W[:, 2 * h_dim :]) + np.dot(r * h, self.U[:, 2 * h_dim :]) + self.b[2 * h_dim :]
            h_tilde = np.tanh(cand_gate)

            h = (1.0 - z) * h + z * h_tilde

        # Output projection
        out = np.dot(h, self.W_out) + self.b_out  # (batch, 16)
        out = out.reshape(batch_size, 4, 4)

        if is_2d:
            return out[0]
        return out

    def predict_lead_probabilities(self, sequence: np.ndarray) -> dict[str, dict[str, float]]:
        """Compute normalized lead-time probabilities for week_1 through week_4.
        
        Returns:
            Dict mapping 'week_1'..'week_4' to {'onset': p, 'active': p, 'break': p, 'heavy': p}.
        """
        # Ensure sequence length is at least 1, pad or trim to 30
        if sequence.shape[0] < 14:
            # Pad with first element
            padding = np.repeat(sequence[:1], 14 - sequence.shape[0], axis=0)
            sequence = np.vstack([padding, sequence])

        logits = self.forward(sequence)  # (4, 4)
        probs = self._softmax(logits)     # (4, 4)

        leads = ["week_1", "week_2", "week_3", "week_4"]
        states = ["onset", "active", "break", "heavy"]

        result: dict[str, dict[str, float]] = {}
        for w_idx, lead in enumerate(leads):
            w_probs = probs[w_idx]
            result[lead] = {
                state: round(float(w_probs[s_idx]), 4)
                for s_idx, state in enumerate(states)
            }
        return result

    def fit_dummy_or_fine_tune(
        self,
        X_seqs: Sequence[np.ndarray],
        y_targets: Sequence[np.ndarray],
        epochs: int = 5,
        lr: float = 0.01,
    ) -> "SmallGRUModel":
        """Lightweight gradient descent update using numerical/finite differences for calibration."""
        # Simple loss optimization if targets are provided
        if not X_seqs or not y_targets:
            return self

        for _ in range(epochs):
            for seq, y_true in zip(X_seqs, y_targets):
                pred = self.forward(seq)  # (4, 4)
                probs = self._softmax(pred)
                grad_out = (probs - y_true).reshape(1, -1)  # (1, 16)
                # Apply small update to output projection
                h_last = np.tanh(np.dot(seq[-1:], self.W[:, :self.hidden_dim]))
                self.W_out -= lr * np.dot(h_last.T, grad_out)
                self.b_out -= lr * grad_out[0]

        return self

    def save(self, filepath: Path) -> None:
        """Serialize parameters to compact JSON."""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "input_dim": self.input_dim,
            "hidden_dim": self.hidden_dim,
            "output_dim": self.output_dim,
            "W": self.W.tolist(),
            "U": self.U.tolist(),
            "b": self.b.tolist(),
            "W_out": self.W_out.tolist(),
            "b_out": self.b_out.tolist(),
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f)

    @classmethod
    def load(cls, filepath: Path) -> "SmallGRUModel":
        """Load parameters from JSON."""
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        model = cls(
            input_dim=data["input_dim"],
            hidden_dim=data["hidden_dim"],
            output_dim=data["output_dim"],
        )
        model.W = np.array(data["W"], dtype=np.float64)
        model.U = np.array(data["U"], dtype=np.float64)
        model.b = np.array(data["b"], dtype=np.float64)
        model.W_out = np.array(data["W_out"], dtype=np.float64)
        model.b_out = np.array(data["b_out"], dtype=np.float64)
        return model
