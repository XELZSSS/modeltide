import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  ArcElement,
  DoughnutController,
  PointElement,
  LineElement,
  LineController,
  Filler,
  RadialLinearScale,
  RadarController,
  Tooltip,
  Legend,
} from "chart.js";
import { applyChartDefaults } from "./factory";

applyChartDefaults(ChartJS);

function registerChart(...elements: Parameters<(typeof ChartJS)["register"]>[number][]): void {
  (ChartJS.register as (...args: unknown[]) => void)(...elements);
}

export function registerBar(): void {
  registerChart(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);
}
export function registerLine(): void {
  registerChart(LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
}
export function registerDoughnut(): void {
  registerChart(DoughnutController, ArcElement, Tooltip, Legend);
}
export function registerRadar(): void {
  registerChart(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
}

export type ChartKind = "bar" | "line" | "doughnut" | "radar";

const ensured = new Set<ChartKind>();

export function ensureCharts(kind: ChartKind): void {
  if (ensured.has(kind)) return;
  ensured.add(kind);
  if (kind === "bar") registerBar();
  else if (kind === "line") registerLine();
  else if (kind === "doughnut") registerDoughnut();
  else registerRadar();
}
