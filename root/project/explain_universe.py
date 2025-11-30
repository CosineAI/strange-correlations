#!/usr/bin/env python3
"""
A tiny CLI that prints a terse, structured "explain the universe" overview.
No external deps. Pure stdout so it's easy to run anywhere.
"""
from __future__ import annotations

SECTIONS = [
    (
        "1) Origins (Big Bang)",
        "13.8 billion years ago, the observable universe began hot, dense, and rapidly expanding. "
        "Quantum fluctuations were stretched by inflation, seeding structure. Expansion continues today.",
    ),
    (
        "2) Contents",
        "- Ordinary (baryonic) matter: ~5%\n"
        "- Dark matter: ~27% (gravitationally attractive, not EM-interacting)\n"
        "- Dark energy: ~68% (drives accelerated expansion)",
    ),
    (
        "3) Laws (Symmetries and Forces)",
        "- Quantum fields underlie particles.\n"
        "- The Standard Model + General Relativity describe most observed phenomena.\n"
        "- Gauge symmetries (SU(3)×SU(2)×U(1)) → strong, weak, electromagnetic; GR → gravity as spacetime curvature.",
    ),
    (
        "4) Structure Formation",
        "Small over-densities grew via gravity → gas falls into dark-matter halos → stars, galaxies, clusters.\n"
        "Stellar fusion forges elements; supernovae and winds recycle metals into new generations of stars and planets.",
    ),
    (
        "5) Cosmic Evolution",
        "Early plasma → neutral atoms (recombination, CMB) → first stars/galaxies → cosmic web.\n"
        "Today: accelerated expansion dominated by dark energy; distant galaxies recede faster with time.",
    ),
    (
        "6) Life and Complexity",
        "Chemistry on temperate worlds around long-lived stars can yield self-replicators, evolution, and intelligence.\n"
        "Our measurements are a way the universe observes itself.",
    ),
    (
        "7) Open Questions",
        "- Nature of dark matter?\n"
        "- What is dark energy (cosmological constant vs dynamics)?\n"
        "- Quantum gravity (reconciling GR and quantum mechanics).\n"
        "- Why these constants and initial conditions?\n"
        "- Are we one bubble in a larger multiverse?",
    ),
    (
        "8) Key Observables",
        "Cosmic Microwave Background, baryon acoustic oscillations, Type Ia supernovae, large-scale structure,\n"
        "gravitational lensing, nucleosynthesis abundances, gravitational waves.",
    ),
    (
        "9) Elevator Equations (informal)",
        "- Friedmann: (H/H0)^2 ≈ Ω_m a^{-3} + Ω_r a^{-4} + Ω_k a^{-2} + Ω_Λ\n"
        "- Structure growth: δ'' + 2H δ' − 4πGρ δ = 0\n"
        "- GR: G_{μν} = 8πG T_{μν}\n"
        "- Quantum fields: excitations → particles, symmetries → conservation laws",
    ),
    (
        "10) The Short Answer",
        "A simple set of fields, symmetries, and initial conditions evolved for 13.8 Gyr under gravity and quantum rules,\n"
        "producing structure, stars, chemistry, life, and questions we are still refining with data.",
    ),
]


def explain_brief() -> str:
    lines = ["Explain the Universe — ultra-brief:"]
    lines.append(
        "A hot, dense beginning expanded and cooled; gravity amplified tiny fluctuations into galaxies and stars;"
        " fusion built elements; chemistry on some worlds produced life; expansion now accelerates, and key unknowns remain"
        " (dark matter, dark energy, quantum gravity)."
    )
    return "\n".join(lines)


def explain_full() -> str:
    parts = ["Explain the Universe — a concise tour:"]
    for title, body in SECTIONS:
        parts.append("")
        parts.append(title)
        parts.append("-" * len(title))
        parts.append(body)
    return "\n".join(parts)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Print a terse explanation of the universe.")
    parser.add_argument(
        "--brief",
        action="store_true",
        help="Show an ultra-brief explanation",
    )
    args = parser.parse_args()

    text = explain_brief() if args.brief else explain_full()
    print(text)


if __name__ == "__main__":
    main()
