"""Stage 1: Small GRU Sequence Model for Teleconnection Trajectory Cross-Check.

Implements a compact Gated Recurrent Unit (GRU) sequence model specified in TECH_STACK.md §5:
- Input: temporal trajectory of teleconnections (seq_len x 5 features: [ONI, DMI, RMM1, RMM2, Amplitude])
- Hidden state: 16 units (compact ~1,300 parameters)
- Genuine supervised training with deterministic Adam optimizer and BPTT
- Verification that trained weights shift from random initialization
- Parameter serialization to JSON (< 30 KB)
- Strict disabling when training data is insufficient
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
        self.seed = seed
        self.rng = np.random.RandomState(seed)

        # GRU Weights: update gate (z), reset gate (r), candidate state (h)
        limit = np.sqrt(6.0 / (input_dim + hidden_dim))
        self.W = self.rng.uniform(-limit, limit, (input_dim, 3 * hidden_dim))
        self.U = self.rng.uniform(-limit, limit, (hidden_dim, 3 * hidden_dim))
        self.b = np.zeros(3 * hidden_dim, dtype=np.float64)

        # Output projection head: Linear(hidden_dim, 16)
        out_limit = np.sqrt(6.0 / (hidden_dim + output_dim))
        self.W_out = self.rng.uniform(-out_limit, out_limit, (hidden_dim, output_dim))
        self.b_out = np.zeros(output_dim, dtype=np.float64)

        # Training status metadata
        self.is_trained: bool = False
        self.train_loss: Optional[float] = None
        self.val_loss: Optional[float] = None
        self.weight_delta_norm: float = 0.0
        self.epochs_trained: int = 0

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

    def predict_lead_matrix(self, sequence: np.ndarray) -> np.ndarray:
        """Compute normalized lead-time probabilities as (4, 4) matrix.
        
        Rows: lead weeks 1..4 (indices 0..3)
        Columns: [Active, Onset, Break, Heavy] (classes 0..3)
        """
        if sequence.shape[0] < 14:
            padding = np.repeat(sequence[:1], 14 - sequence.shape[0], axis=0)
            sequence = np.vstack([padding, sequence])

        logits = self.forward(sequence)  # (4, 4)
        probs = self._softmax(logits)     # (4, 4)
        return probs

    def predict_lead_probabilities(self, sequence: np.ndarray) -> dict[str, dict[str, float]]:
        """Compute normalized lead-time probabilities for week_1 through week_4.
        
        State order aligns with BHUMI classes:
          0: active, 1: onset, 2: break, 3: heavy
        """
        probs = self.predict_lead_matrix(sequence)

        leads = ["week_1", "week_2", "week_3", "week_4"]
        states = ["active", "onset", "break", "heavy"]

        result: dict[str, dict[str, float]] = {}
        for w_idx, lead in enumerate(leads):
            w_probs = probs[w_idx]
            result[lead] = {
                state: round(float(w_probs[s_idx]), 4)
                for s_idx, state in enumerate(states)
            }
        return result

    def train_supervised(
        self,
        X_seqs: np.ndarray,
        y_targets: np.ndarray,
        epochs: int = 30,
        lr: float = 0.01,
        val_split: float = 0.20,
    ) -> dict[str, Any]:
        """Execute genuine deterministic supervised training with Adam optimizer and BPTT.
        
        Args:
            X_seqs: Sequence batch of shape (N, seq_len, 5)
            y_targets: Target distributions of shape (N, 4, 4) or (N, 16)
            epochs: Training epochs
            lr: Learning rate
            val_split: Fraction of held-out validation samples (chronological split)
            
        Returns:
            Dict of training diagnostics and loss progression.
        """
        N = len(X_seqs)
        if N < 4:
            raise ValueError(f"Cannot train GRU: minimum 4 sequences required, got {N}")

        y_flat = y_targets.reshape(N, 16)

        # Snapshot initial weights to verify post-training deviation
        W_init = self.W.copy()
        W_out_init = self.W_out.copy()

        # Chronological train/val split (no shuffling)
        split_idx = int(N * (1.0 - val_split))
        split_idx = max(2, min(N - 1, split_idx))

        X_train, y_train = X_seqs[:split_idx], y_flat[:split_idx]
        X_val, y_val = X_seqs[split_idx:], y_flat[split_idx:]
        n_train = len(X_train)

        # Adam optimizer state variables
        m_W, v_W = np.zeros_like(self.W), np.zeros_like(self.W)
        m_U, v_U = np.zeros_like(self.U), np.zeros_like(self.U)
        m_b, v_b = np.zeros_like(self.b), np.zeros_like(self.b)
        m_W_out, v_W_out = np.zeros_like(self.W_out), np.zeros_like(self.W_out)
        m_b_out, v_b_out = np.zeros_like(self.b_out), np.zeros_like(self.b_out)

        beta1, beta2, eps = 0.9, 0.999, 1e-8
        t_step = 0

        loss_history: list[float] = []
        h_dim = self.hidden_dim
        seq_len = X_train.shape[1]

        for epoch in range(1, epochs + 1):
            t_step += 1

            # Forward pass across training sequences
            h_history: list[np.ndarray] = []
            z_history: list[np.ndarray] = []
            r_history: list[np.ndarray] = []
            ht_history: list[np.ndarray] = []

            h_prev = np.zeros((n_train, h_dim), dtype=np.float64)

            for t in range(seq_len):
                x_t = X_train[:, t, :]
                gates = np.dot(x_t, self.W) + np.dot(h_prev, self.U) + self.b

                z_t = self._sigmoid(gates[:, :h_dim])
                r_t = self._sigmoid(gates[:, h_dim : 2 * h_dim])

                cand = np.dot(x_t, self.W[:, 2 * h_dim :]) + np.dot(r_t * h_prev, self.U[:, 2 * h_dim :]) + self.b[2 * h_dim :]
                h_tilde = np.tanh(cand)

                h_next = (1.0 - z_t) * h_prev + z_t * h_tilde

                z_history.append(z_t)
                r_history.append(r_t)
                ht_history.append(h_tilde)
                h_history.append(h_prev)  # state entering step t

                h_prev = h_next

            h_final = h_prev  # (n_train, h_dim)

            # Output layer forward
            logits = np.dot(h_final, self.W_out) + self.b_out  # (n_train, 16)
            logits_reshaped = logits.reshape(n_train, 4, 4)
            probs_reshaped = self._softmax(logits_reshaped)
            probs = probs_reshaped.reshape(n_train, 16)

            # Cross-entropy loss
            loss = -float(np.mean(np.sum(y_train * np.log(np.clip(probs, 1e-12, 1.0)), axis=1)))
            loss_history.append(round(loss, 5))

            # Backward pass: gradient on output projection
            d_logits = (probs - y_train) / n_train  # (n_train, 16)
            dW_out = np.dot(h_final.T, d_logits)
            db_out = np.sum(d_logits, axis=0)

            # Backprop into last hidden state
            dh = np.dot(d_logits, self.W_out.T)  # (n_train, h_dim)

            dW = np.zeros_like(self.W)
            dU = np.zeros_like(self.U)
            db = np.zeros_like(self.b)

            # BPTT through time steps
            for t in reversed(range(seq_len)):
                x_t = X_train[:, t, :]
                h_prev_t = h_history[t]
                z_t = z_history[t]
                r_t = r_history[t]
                h_tilde = ht_history[t]

                dh_tilde = dh * z_t * (1.0 - h_tilde ** 2)
                dz = dh * (h_tilde - h_prev_t) * z_t * (1.0 - z_t)
                dr = np.dot(dh_tilde, self.U[:, 2 * h_dim :].T) * h_prev_t * r_t * (1.0 - r_t)

                dgates = np.hstack([dz, dr, dh_tilde])  # (n_train, 3 * h_dim)

                dW += np.dot(x_t.T, dgates)
                dU += np.dot(h_prev_t.T, dgates)
                db += np.sum(dgates, axis=0)

                # Propagate dh back to previous step
                dh = dh * (1.0 - z_t) + np.dot(dgates[:, : 2 * h_dim], self.U[:, : 2 * h_dim].T) + np.dot(dh_tilde, self.U[:, 2 * h_dim :].T) * r_t

            # Gradient clipping to prevent instability
            for g in (dW_out, db_out, dW, dU, db):
                np.clip(g, -2.0, 2.0, out=g)

            # Adam updates
            for param, grad, m, v in [
                (self.W_out, dW_out, m_W_out, v_W_out),
                (self.b_out, db_out, m_b_out, v_b_out),
                (self.W, dW, m_W, v_W),
                (self.U, dU, m_U, v_U),
                (self.b, db, m_b, v_b),
            ]:
                m[:] = beta1 * m + (1.0 - beta1) * grad
                v[:] = beta2 * v + (1.0 - beta2) * (grad ** 2)
                m_hat = m / (1.0 - beta1 ** t_step)
                v_hat = v / (1.0 - beta2 ** t_step)
                param -= lr * m_hat / (np.sqrt(v_hat) + eps)

        # Validation loss evaluation
        val_logits = self.forward(X_val).reshape(len(X_val), 16)
        val_probs = self._softmax(val_logits.reshape(len(X_val), 4, 4)).reshape(len(X_val), 16)
        val_loss = -float(np.mean(np.sum(y_val * np.log(np.clip(val_probs, 1e-12, 1.0)), axis=1)))

        # Verify weight movement
        delta_norm = float(np.linalg.norm(self.W - W_init) + np.linalg.norm(self.W_out - W_out_init))
        self.weight_delta_norm = round(delta_norm, 5)
        self.is_trained = (delta_norm > 1e-4) and (loss_history[-1] <= loss_history[0] * 1.05)
        self.train_loss = loss_history[-1]
        self.val_loss = round(val_loss, 5)
        self.epochs_trained = epochs

        return {
            "is_trained": self.is_trained,
            "initial_loss": loss_history[0],
            "final_loss": loss_history[-1],
            "val_loss": self.val_loss,
            "weight_delta_norm": self.weight_delta_norm,
            "epochs": epochs,
            "train_samples": n_train,
            "val_samples": len(X_val),
        }

    def save(self, filepath: Path) -> None:
        """Serialize parameters and training status to JSON."""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "input_dim": self.input_dim,
            "hidden_dim": self.hidden_dim,
            "output_dim": self.output_dim,
            "is_trained": self.is_trained,
            "train_loss": self.train_loss,
            "val_loss": self.val_loss,
            "weight_delta_norm": self.weight_delta_norm,
            "epochs_trained": self.epochs_trained,
            "W": self.W.tolist(),
            "U": self.U.tolist(),
            "b": self.b.tolist(),
            "W_out": self.W_out.tolist(),
            "b_out": self.b_out.tolist(),
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load(cls, filepath: Path) -> "SmallGRUModel":
        """Load parameters and training status from JSON."""
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        model = cls(
            input_dim=data["input_dim"],
            hidden_dim=data["hidden_dim"],
            output_dim=data["output_dim"],
        )
        model.is_trained = data.get("is_trained", False)
        model.train_loss = data.get("train_loss")
        model.val_loss = data.get("val_loss")
        model.weight_delta_norm = data.get("weight_delta_norm", 0.0)
        model.epochs_trained = data.get("epochs_trained", 0)

        model.W = np.array(data["W"], dtype=np.float64)
        model.U = np.array(data["U"], dtype=np.float64)
        model.b = np.array(data["b"], dtype=np.float64)
        model.W_out = np.array(data["W_out"], dtype=np.float64)
        model.b_out = np.array(data["b_out"], dtype=np.float64)
        return model
