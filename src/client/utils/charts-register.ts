"use client";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  RadialLinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { applyChartDefaults } from "./charts";

function registerChart(...elements: Parameters<(typeof ChartJS)["register"]>[number][]): void {
  (ChartJS.register as (...args: unknown[]) => void)(...elements);
  applyChartDefaults(ChartJS);
}

export function registerBar(): void {
  registerChart(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
}
export function registerLine(): void {
  registerChart(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
}
export function registerDoughnut(): void {
  registerChart(ArcElement, Tooltip, Legend);
}
export function registerRadar(): void {
  registerChart(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
}
