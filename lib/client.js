window.__ModuleLoader__.load({
	id: "dsh-usage-board",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		const { useState, useEffect, useCallback, useRef } = react;
		const { jsx, jsxs, Fragment } = jsxRuntime;

		const POLL_MS = 60 * 1000;
		const PATH = "/api/usage-board";
		const POS_KEY = "dsh-usage-board-pos";

		function ensureStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById("dsh-usage-board-style")) return;
			const style = document.createElement("style");
			style.id = "dsh-usage-board-style";
			style.textContent = "@keyframes dsh-usage-spin{to{transform:rotate(360deg)}}";
			document.head.appendChild(style);
		}

		function defaultPos() {
			const w = typeof window === "undefined" ? 800 : window.innerWidth;
			const h = typeof window === "undefined" ? 600 : window.innerHeight;
			return { left: Math.max(8, w - 16 - 168), top: Math.max(8, h - 16 - 34) };
		}

		function clamp(left, top, width, height) {
			const vw = window.innerWidth || 800;
			const vh = window.innerHeight || 600;
			return {
				left: Math.min(Math.max(8, vw - width - 8), Math.max(8, left)),
				top: Math.min(Math.max(8, vh - height - 8), Math.max(8, top))
			};
		}

		function loadPos() {
			try {
				const p = JSON.parse(localStorage.getItem(POS_KEY) || "");
				if (typeof p.left === "number" && typeof p.top === "number") return clamp(p.left, p.top, 168, 34);
			} catch {}
			return defaultPos();
		}

		function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} }

		function tone(percent, ok, skipped) {
			if (skipped) return "var(--dsw-alias-label-secondary)";
			if (!ok) return "var(--dsw-alias-state-error-primary)";
			if (typeof percent !== "number") return "var(--dsw-alias-state-success-primary)";
			if (percent >= 90) return "var(--dsw-alias-state-error-primary)";
			if (percent >= 70) return "var(--dsw-alias-state-warning-primary, #d97706)";
			return "var(--dsw-alias-state-success-primary)";
		}

		function formatReset(iso) {
			if (!iso) return "";
			const end = new Date(iso);
			if (Number.isNaN(end.getTime())) return "";
			const ms = end.getTime() - Date.now();
			const when = end.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
			if (ms <= 0) return "已重置点 " + when;
			const hours = Math.floor(ms / 3600000);
			if (hours >= 48) return when + " · " + Math.round(hours / 24) + "天";
			if (hours >= 1) return when + " · " + hours + "h";
			return when + " · " + Math.floor(ms / 60000) + "m";
		}

		async function fetchBoard() {
			const res = await fetch(PATH, { cache: "no-store" });
			let body = null;
			try { body = await res.json(); } catch {}
			if (!res.ok || !body || body.ok !== true) {
				throw new Error(body && body.message ? body.message : "HTTP " + res.status);
			}
			return body;
		}

		const shell = { position: "fixed", zIndex: 40, pointerEvents: "auto", boxSizing: "border-box", touchAction: "none", userSelect: "none" };
		const pillLook = {
			display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px",
			borderRadius: 999, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-overlay)",
			boxShadow: "0 4px 16px rgba(0,0,0,.16)", color: "var(--dsw-alias-label-primary)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap"
		};
		const cardLook = {
			width: 280, borderRadius: 12, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-overlay)",
			boxShadow: "0 4px 16px rgba(0,0,0,.16)", color: "var(--dsw-alias-label-primary)", fontSize: 12, padding: "8px 10px",
			display: "flex", flexDirection: "column", gap: 6
		};
		const iconBtn = { flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, border: 0, borderRadius: 6, padding: 0, background: "transparent", color: "var(--dsw-alias-label-secondary)", cursor: "pointer" };
		const meta = { color: "var(--dsw-alias-label-secondary)", fontSize: 11, lineHeight: "16px" };

		function UsageBoardBadge() {
			const [data, setData] = useState(null);
			const [phase, setPhase] = useState("loading");
			const [message, setMessage] = useState("");
			const [spinning, setSpinning] = useState(false);
			const [expanded, setExpanded] = useState(false);
			const [openId, setOpenId] = useState(null);
			const [pos, setPos] = useState(defaultPos);
			const [dragging, setDragging] = useState(false);
			const mounted = useRef(true);
			const elRef = useRef(null);
			const drag = useRef(null);

			useEffect(() => { ensureStyles(); setPos(loadPos()); }, []);

			const load = useCallback(async () => {
				setSpinning(true);
				try {
					const result = await fetchBoard();
					if (!mounted.current) return;
					setData(result);
					setPhase("ready");
					setMessage("");
				} catch (error) {
					if (!mounted.current) return;
					setPhase("error");
					setMessage(error instanceof Error ? error.message : String(error));
				} finally {
					if (mounted.current) setSpinning(false);
				}
			}, []);

			useEffect(() => {
				mounted.current = true;
				load();
				const timer = setInterval(load, POLL_MS);
				return () => { mounted.current = false; clearInterval(timer); };
			}, [load]);

			function onPointerDown(e) {
				if (e.button !== 0) return;
				if (e.target && e.target.closest && e.target.closest("button") && e.currentTarget !== e.target) return;
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top, moved: false };
			}
			function onPointerMove(e) {
				const d = drag.current; if (!d) return;
				const dx = e.clientX - d.x, dy = e.clientY - d.y;
				if (!d.moved && dx * dx + dy * dy < 25) return;
				d.moved = true; setDragging(true);
				const box = elRef.current ? elRef.current.getBoundingClientRect() : { width: 168, height: 34 };
				setPos(clamp(d.left + dx, d.top + dy, box.width, box.height));
			}
			function onPointerUp() {
				const d = drag.current; drag.current = null; setDragging(false);
				if (!d) return;
				if (d.moved) {
					const box = elRef.current ? elRef.current.getBoundingClientRect() : { width: 168, height: 34 };
					setPos((p) => { const n = clamp(p.left, p.top, box.width, box.height); savePos(n); return n; });
					return;
				}
				setExpanded((v) => !v);
			}
			const dragHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

			const providers = data && Array.isArray(data.providers) ? data.providers : [];
			const visible = providers.filter((p) => !p.skipped);
			const alert = visible.reduce((best, p) => {
				if (typeof p.percent !== "number") return best;
				if (!best || p.percent > best.percent) return p;
				return best;
			}, null);
			const color = phase === "error" ? tone(null, false, false) : tone(alert ? alert.percent : null, phase === "ready", false);

			const refreshIcon = jsx("svg", {
				width: 13, height: 13, viewBox: "0 0 16 16", fill: "none",
				style: spinning ? { animation: "dsh-usage-spin .8s linear infinite" } : void 0,
				children: jsx("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })
			});
			const dot = jsx("span", { style: { flex: "none", width: 8, height: 8, borderRadius: "50%", background: phase === "loading" ? "var(--dsw-alias-label-secondary)" : color }, "aria-hidden": true });

			function meterRow(label, value, valueColor) {
				return jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0" }, children: [
					jsx("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 }, children: label }),
					jsx("span", { style: { fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 15, color: valueColor || "var(--dsw-alias-label-primary)" }, children: value || "—" })
				] });
			}
			const menuIcon = jsx("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", children: jsxs(Fragment, { children: [
				jsx("path", { d: "M2 4h12", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
				jsx("path", { d: "M2 8h12", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
				jsx("path", { d: "M2 12h12", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })
			] }) });

			if (!expanded) {
				const short = phase === "error" ? "错误" : (alert && alert.headline ? alert.label.replace("SuperGrok", "Grok") + " " + alert.headline : (phase === "ready" ? visible.length + " 路" : "…"));
				return jsx("div", Object.assign({
					ref: elRef, "data-plugin": "dsh-usage-board", role: "button", tabIndex: 0,
					title: "拖动可移动 · 点击展开",
					style: Object.assign({}, shell, pillLook, { left: pos.left, top: pos.top, cursor: dragging ? "grabbing" : "grab" })
				}, dragHandlers, {
					children: jsxs(Fragment, { children: [dot, jsx("span", { children: "用量" }), jsx("span", { style: { fontVariantNumeric: "tabular-nums", color }, children: short })] })
				}));
			}

			const ds = providers.find((p) => p.id === "deepseek");
			if (openId === "deepseek" && ds && ds.ok) {
				const extra = ds.extra && ds.extra.layout === "deepseek-meter" ? ds.extra : {};
				const green = "var(--dsw-alias-state-success-primary)";
				const orange = "var(--dsw-alias-state-warning-primary, #e0a054)";
				return jsx("div", {
					ref: elRef, role: "status", "data-plugin": "dsh-usage-board",
					style: Object.assign({}, shell, cardLook, { left: pos.left, top: pos.top, width: 260, padding: "10px 14px 12px", gap: 2 }),
					children: jsxs(Fragment, { children: [
						jsxs("div", Object.assign({ style: { display: "flex", alignItems: "center", gap: 4, height: 22, marginBottom: 6, cursor: dragging ? "grabbing" : "grab" } }, dragHandlers, { children: [
							jsx("button", { type: "button", style: iconBtn, title: "返回列表", onClick: (e) => { e.stopPropagation(); setOpenId(null); }, children: menuIcon }),
							jsx("span", { style: { flex: 1 } }),
							jsx("button", { type: "button", style: iconBtn, title: "刷新", onClick: (e) => { e.stopPropagation(); load(); }, children: refreshIcon })
						] })),
						meterRow("余额", extra.balance || ds.headline, green),
						meterRow("今日用量", extra.todayUsage),
						meterRow("本月用量", extra.monthUsage),
						meterRow("缓存命中", extra.cacheHit),
						jsxs("div", { style: { marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--dsw-alias-border-l1)", color: orange, fontSize: 11, lineHeight: "18px" }, children: [
							jsx("div", { children: extra.peakTitle || "高峰时段：周一至周五" }),
							jsx("div", { style: { fontWeight: 700, letterSpacing: 0.2 }, children: extra.peakHours || "9:00-12:00    14:00-18:00" }),
							jsx("div", { style: { opacity: 0.9 }, children: extra.peakHint || "空闲价格为高峰价格的一半" })
						] })
					] })
				});
			}

			return jsx("div", {
				ref: elRef, role: "status", "data-plugin": "dsh-usage-board",
				style: Object.assign({}, shell, cardLook, { left: pos.left, top: pos.top }),
				children: jsxs(Fragment, {
					children: [
						jsxs("div", Object.assign({ style: { display: "flex", alignItems: "center", gap: 6, height: 20, cursor: dragging ? "grabbing" : "grab" } }, dragHandlers, {
							children: [
								dot,
								jsx("span", { style: { flex: 1, fontWeight: 600 }, children: "模型用量" }),
								jsx("button", { type: "button", style: iconBtn, title: "刷新", onClick: (e) => { e.stopPropagation(); load(); }, children: refreshIcon }),
								jsx("button", { type: "button", style: iconBtn, title: "收起", onClick: (e) => { e.stopPropagation(); setExpanded(false); }, children: jsx("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", children: jsx("path", { d: "M3 8h10", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }) }) })
							]
						})),
						phase === "loading" ? jsx("div", { style: meta, children: "加载中…" }) : null,
						phase === "error" ? jsx("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 11, wordBreak: "break-word" }, children: message }) : null,
						phase === "ready" ? providers.map((p) => {
							const c = tone(p.percent, p.ok, p.skipped);
							const open = openId === p.id;
							return jsxs("div", {
								style: { borderTop: "1px solid var(--dsw-alias-border-l1)", paddingTop: 6, cursor: "pointer" },
								onClick: () => setOpenId(open ? null : p.id),
								children: [
									jsxs("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }, children: [
										jsx("span", { style: { fontWeight: 600 }, children: p.label }),
										jsx("span", { style: { fontVariantNumeric: "tabular-nums", color: c, fontWeight: 700 }, children: p.skipped ? "未配置" : (p.ok ? (p.headline || "—") : "错误") })
									] }),
									p.ok && typeof p.percent === "number" ? jsx("div", { style: { height: 5, borderRadius: 99, background: "var(--dsw-alias-interactive-bg-hover)", overflow: "hidden", marginTop: 4 }, children: jsx("div", { style: { width: Math.max(0, Math.min(100, p.percent)) + "%", height: "100%", background: c, borderRadius: 99 } }) }) : null,
									open && p.ok && Array.isArray(p.details) ? p.details.map((d, i) => jsxs("div", { style: meta, children: [d.label, " ", d.value, d.extra ? " · " + formatReset(d.extra) : ""] }, i)) : null,
									open && p.resetAt && !(p.details || []).some((d) => d.extra) ? jsx("div", { style: meta, children: "重置 " + formatReset(p.resetAt) }) : null,
									open && p.error ? jsx("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 11 }, children: p.error }) : null
								]
							}, p.id);
						}) : null
					]
				})
			});
		}

		const inject = ["slots"];
		function apply(ctx) {
			ensureStyles();
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "usage-board", order: 102, label: "模型用量" }, UsageBoardBadge));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
