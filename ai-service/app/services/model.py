import numpy as np
from sklearn.ensemble import IsolationForest


def train_model() -> IsolationForest:
    """Generate exactly 250 reproducible synthetic feature rows and fit locally."""
    rng = np.random.default_rng(311)
    overtime_hours = np.clip(rng.normal(5.5, 4.0, 250), 0, 24)
    overtime_ratio = np.clip(overtime_hours * 1.25 / 160, 0, 0.25)
    deduction_ratio = np.clip(rng.normal(0.11, 0.045, 250), 0, 0.30)
    features = np.column_stack((overtime_hours, overtime_ratio, deduction_ratio))
    model = IsolationForest(n_estimators=150, contamination=0.05, random_state=311)
    model.fit(features)
    return model


MODEL = train_model()
