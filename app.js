(() => {
    const STORAGE_KEY_URL = "dtd_tracker_firebase_url";
    const STORAGE_KEY_AUTH = "dtd_tracker_firebase_auth";

    const PALETTE = [
        "#f5b942",
        "#2dd4bf",
        "#60a5fa",
        "#f472b6",
        "#a78bfa",
        "#fb923c",
        "#34d399",
        "#f87171"
    ];

    let playersData = {};
    let historyData = {};
    let coinsChart = null;
    let refreshTimer = null;

    const $ = (id) => document.getElementById(id);

    function getSettings() {
        const base = window.TRACKER_CONFIG || {};
        const savedUrl = localStorage.getItem(STORAGE_KEY_URL);
        const savedAuth = localStorage.getItem(STORAGE_KEY_AUTH);
        const rawUrl = (savedUrl !== null ? savedUrl : (base.FIREBASE_URL || "")).trim().replace(/\/+$/, "");
        const auth = (savedAuth !== null ? savedAuth : (base.FIREBASE_AUTH || "")).trim();
        return {
            firebaseUrl: rawUrl,
            firebaseAuth: auth,
            refreshSec: Number(base.REFRESH_INTERVAL_SEC) || 15,
            offlineSec: Number(base.OFFLINE_THRESHOLD_SEC) || 90
        };
    }

    function buildFirebaseUrl(path, queryParams = {}) {
        const { firebaseUrl, firebaseAuth } = getSettings();
        const url = new URL(`${firebaseUrl}/${path.replace(/^\/+/, "")}.json`);
        for (const [k, v] of Object.entries(queryParams)) {
            url.searchParams.set(k, v);
        }
        if (firebaseAuth) {
            url.searchParams.set("auth", firebaseAuth);
        }
        return url.toString();
    }

    function formatNumber(n) {
        const num = Number(n) || 0;
        return num.toLocaleString("en-US");
    }

    function formatCompact(n) {
        const num = Number(n) || 0;
        if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + "B";
        if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + "M";
        if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + "K";
        return formatNumber(num);
    }

    function formatDuration(seconds) {
        const s = Math.max(0, Math.floor(Number(seconds) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${sec}s`;
        return `${sec}s`;
    }

    function timeAgo(timestampMs) {
        if (!timestampMs) return "Chưa rõ";
        const diffSec = Math.max(0, Math.floor((Date.now() - Number(timestampMs)) / 1000));
        if (diffSec < 60) return `${diffSec}s trước`;
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m trước`;
        return `${Math.floor(diffSec / 3600)}h trước`;
    }

    function getStatusInfo(updatedAtMs, offlineSec) {
        if (!updatedAtMs) return { cls: "badge-offline", label: "Offline", online: false };
        const ageSec = (Date.now() - Number(updatedAtMs)) / 1000;
        if (ageSec <= 45) return { cls: "badge-online", label: `Online • ${Math.floor(ageSec)}s`, online: true };
        if (ageSec <= offlineSec) return { cls: "badge-warn", label: `Chậm • ${Math.floor(ageSec)}s`, online: true };
        return { cls: "badge-offline", label: `Offline • ${timeAgo(updatedAtMs)}`, online: false };
    }

    function computeCoinsPerHour(playerHistory) {
        if (!playerHistory) return 0;
        const points = Object.values(playerHistory)
            .filter((p) => p && typeof p.coins === "number" && typeof p.t === "number")
            .sort((a, b) => a.t - b.t);
        if (points.length < 2) return 0;
        const first = points[0];
        const last = points[points.length - 1];
        const hours = (last.t - first.t) / 3600000;
        if (hours <= 0.008) return 0; // < ~30s
        return Math.round((last.coins - first.coins) / hours);
    }

    function setSyncStatus(state, text) {
        const pill = $("syncStatus");
        pill.classList.remove("ok", "err");
        if (state === "ok") pill.classList.add("ok");
        if (state === "err") pill.classList.add("err");
        $("syncText").textContent = text;
    }

    async function fetchAllData() {
        const { firebaseUrl } = getSettings();
        if (!firebaseUrl) {
            $("setupBanner").classList.remove("hidden");
            setSyncStatus("err", "Chưa có Firebase URL");
            return;
        }
        $("setupBanner").classList.add("hidden");

        try {
            const res = await fetch(buildFirebaseUrl("players"));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            playersData = (await res.json()) || {};

            const limit = Number($("chartRangeSelect").value) || 60;
            const playerNames = Object.keys(playersData);

            const histEntries = await Promise.all(
                playerNames.map(async (name) => {
                    try {
                        const hRes = await fetch(
                            buildFirebaseUrl(`history/${encodeURIComponent(name)}`, {
                                orderBy: '"$key"',
                                limitToLast: String(limit)
                            })
                        );
                        if (!hRes.ok) return [name, {}];
                        const json = (await hRes.json()) || {};
                        return [name, json];
                    } catch {
                        return [name, {}];
                    }
                })
            );

            historyData = Object.fromEntries(histEntries);
            renderAll();
            const nowStr = new Date().toLocaleTimeString("vi-VN", { hour12: false });
            setSyncStatus("ok", `Đã đồng bộ lúc ${nowStr}`);
        } catch (err) {
            console.error(err);
            setSyncStatus("err", `Lỗi kết nối: ${err.message}`);
        }
    }

    function renderAll() {
        renderKPIs();
        renderTable();
        renderChart();
    }

    function renderKPIs() {
        const { offlineSec } = getSettings();
        const players = Object.values(playersData);
        let totalCoins = 0;
        let totalGems = 0;
        let totalCrystals = 0;
        let totalWins = 0;
        let totalMatches = 0;
        let totalRate = 0;
        let onlineCount = 0;

        for (const p of players) {
            totalCoins += Number(p.coins) || 0;
            totalGems += Number(p.gems) || 0;
            totalCrystals += Number(p.endlessCrystals) || 0;
            totalWins += Number(p.wins) || 0;
            totalMatches += Number(p.matches) || 0;
            const st = getStatusInfo(p.updatedAt, offlineSec);
            if (st.online) onlineCount++;
            totalRate += computeCoinsPerHour(historyData[p.name]);
        }

        $("kpiTotalCoins").textContent = formatNumber(totalCoins);
        const ratePrefix = totalRate >= 0 ? "+" : "";
        $("kpiCoinsRate").textContent = `${ratePrefix}${formatNumber(totalRate)} / giờ`;
        $("kpiOnline").textContent = `${onlineCount} / ${players.length}`;
        $("kpiOfflineCount").textContent = `${players.length - onlineCount} offline`;
        $("kpiTotalGems").textContent = formatNumber(totalGems);
        $("kpiTotalCrystals").textContent = `${formatNumber(totalCrystals)} Endless Crystals`;
        $("kpiTotalWins").textContent = formatNumber(totalWins);
        $("kpiTotalMatches").textContent = `${formatNumber(totalMatches)} matches`;
    }

    function renderTable() {
        const { offlineSec } = getSettings();
        const q = ($("searchInput").value || "").trim().toLowerCase();
        const tbody = $("accountsBody");

        const players = Object.values(playersData)
            .filter((p) => {
                if (!q) return true;
                return (
                    (p.name || "").toLowerCase().includes(q) ||
                    (p.map || "").toLowerCase().includes(q) ||
                    (p.difficulty || "").toLowerCase().includes(q)
                );
            })
            .sort((a, b) => (Number(b.coins) || 0) - (Number(a.coins) || 0));

        if (players.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">Chưa có dữ liệu tài khoản nào. Hãy chạy script <code>dtd_stats_sender.luau</code> trong game.</td></tr>`;
            return;
        }

        tbody.innerHTML = players
            .map((p) => {
                const st = getStatusInfo(p.updatedAt, offlineSec);
                const rate = computeCoinsPerHour(historyData[p.name]);
                const rateClass = rate > 0 ? "rate-pos" : "rate-zero";
                const rateText = rate > 0 ? `+${formatCompact(rate)}/h` : `${formatCompact(rate)}/h`;
                const matchText = p.state && p.state !== "Lobby"
                    ? `${p.map || "?"} • ${p.difficulty || "?"} (W${p.wave || 0}/${p.maxWave || 0})`
                    : `${p.map || "Lobby"} • ${p.state || "Lobby"}`;
                const hpText = p.baseMaxHP ? `${p.baseHP ?? 0}/${p.baseMaxHP}` : "—";

                return `
                    <tr data-player="${encodeURIComponent(p.name)}">
                        <td>
                            <div class="player-cell">
                                <span class="player-name">${escapeHtml(p.name)}</span>
                                <span class="player-sub">${escapeHtml(p.roundTeam || "—")}</span>
                            </div>
                        </td>
                        <td><span class="badge ${st.cls}">${st.label}</span></td>
                        <td class="gold-text" title="${formatNumber(p.coins)}">${formatNumber(p.coins)}</td>
                        <td class="${rateClass}">${rateText}</td>
                        <td>${formatNumber(p.gems)}</td>
                        <td>${formatNumber(p.endlessCrystals)}</td>
                        <td>${formatNumber(p.traitShards)}</td>
                        <td>${escapeHtml(matchText)}</td>
                        <td>${escapeHtml(hpText)}</td>
                        <td>${formatCompact(p.cash)} / ${formatCompact(p.damage)}</td>
                        <td>${formatNumber(p.wins)} / ${formatNumber(p.endlessBest)}</td>
                    </tr>
                `;
            })
            .join("");

        tbody.querySelectorAll("tr[data-player]").forEach((tr) => {
            tr.addEventListener("click", () => {
                const name = decodeURIComponent(tr.getAttribute("data-player"));
                openDetailModal(playersData[name]);
            });
        });
    }

    function renderChart() {
        const ctx = $("coinsChart").getContext("2d");
        const playerNames = Object.keys(playersData).sort();

        // Collect all timestamps sorted
        const allTimestamps = new Set();
        const perPlayerPoints = {};

        for (const name of playerNames) {
            const pts = Object.values(historyData[name] || {})
                .filter((p) => p && typeof p.coins === "number" && typeof p.t === "number")
                .sort((a, b) => a.t - b.t);
            perPlayerPoints[name] = pts;
            for (const pt of pts) {
                // Bucket by 30s so multiple accounts align nicely on the X axis
                const bucket = Math.round(pt.t / 30000) * 30000;
                allTimestamps.add(bucket);
            }
        }

        const sortedBuckets = Array.from(allTimestamps).sort((a, b) => a - b);
        const labels = sortedBuckets.map((ts) =>
            new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
        );

        const datasets = playerNames.map((name, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const pts = perPlayerPoints[name] || [];
            const bucketMap = new Map();
            for (const pt of pts) {
                const bucket = Math.round(pt.t / 30000) * 30000;
                bucketMap.set(bucket, pt.coins);
            }
            const data = sortedBuckets.map((b) => (bucketMap.has(b) ? bucketMap.get(b) : null));

            return {
                label: name,
                data,
                borderColor: color,
                backgroundColor: color + "22",
                borderWidth: 2,
                pointRadius: 2,
                spanGaps: true,
                tension: 0.25
            };
        });

        if (coinsChart) {
            coinsChart.data.labels = labels;
            coinsChart.data.datasets = datasets;
            coinsChart.update("none");
            return;
        }

        coinsChart = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        labels: { color: "#e6edf7", boxWidth: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (item) => `${item.dataset.label}: ${formatNumber(item.parsed.y)} Coins`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: "#8b9bb4", maxTicksLimit: 10 },
                        grid: { color: "rgba(37, 49, 71, 0.45)" }
                    },
                    y: {
                        ticks: {
                            color: "#8b9bb4",
                            callback: (val) => formatCompact(val)
                        },
                        grid: { color: "rgba(37, 49, 71, 0.45)" }
                    }
                }
            }
        });
    }

    function openDetailModal(p) {
        if (!p) return;
        $("detailTitle").textContent = `Thông số chi tiết — ${p.name}`;

        const boostLeft = p.boostCoinsEnd && p.boostCoinsEnd > Math.floor(Date.now() / 1000)
            ? formatDuration(p.boostCoinsEnd - Math.floor(Date.now() / 1000))
            : "Không có";

        const items = [
            ["Coins (Vàng)", formatNumber(p.coins)],
            ["Gems", formatNumber(p.gems)],
            ["Endless Crystals", formatNumber(p.endlessCrystals)],
            ["Trait Shards", formatNumber(p.traitShards)],
            ["Cash (Trong trận)", formatNumber(p.cash)],
            ["Damage (Trong trận)", formatNumber(p.damage)],
            ["Map / Difficulty", `${p.map || "—"} / ${p.difficulty || "—"}`],
            ["Wave / State", `${p.wave ?? 0} / ${p.maxWave ?? 0} (${p.state || "—"})`],
            ["Base HP / Speed", `${p.baseHP ?? 0}/${p.baseMaxHP ?? 0} • ${p.speed ?? 1}x`],
            ["Wins / Matches", `${formatNumber(p.wins)} / ${formatNumber(p.matches)}`],
            ["Endless Best", `${formatNumber(p.endlessBest)} (Team: ${formatNumber(p.endlessTeamBest)})`],
            ["Endless Keys", formatNumber(p.endlessKeys)],
            ["Pity Legendary", formatNumber(p.pityLegendary)],
            ["Pity Mythic", formatNumber(p.pityMythic)],
            ["Potion Coins / Luck", `${p.potionCoins ?? 0} / ${p.potionLuck ?? 0}`],
            ["Boost x2 Coins còn", boostLeft],
            ["Wheel Spins", formatNumber(p.wheelSpins)],
            ["Playtime / AFK", `${formatDuration(p.playtimeSecs)} / ${formatNumber(p.afkTotal)}`],
            ["Round Team", p.roundTeam || "—"],
            ["Round Traits", p.roundTraits || "—"],
            ["Cập nhật lần cuối", p.updatedAt ? new Date(p.updatedAt).toLocaleString("vi-VN") : "—"]
        ];

        $("detailBody").innerHTML = `
            <div class="detail-grid">
                ${items
                    .map(
                        ([k, v]) => `
                    <div class="detail-item">
                        <div class="k">${escapeHtml(k)}</div>
                        <div class="v">${escapeHtml(String(v))}</div>
                    </div>`
                    )
                    .join("")}
            </div>
        `;
        $("detailModal").classList.remove("hidden");
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function openSettingsModal() {
        const { firebaseUrl, firebaseAuth } = getSettings();
        $("firebaseUrlInput").value = firebaseUrl;
        $("firebaseAuthInput").value = firebaseAuth;
        $("settingsModal").classList.remove("hidden");
    }

    function setupEvents() {
        $("refreshBtn").addEventListener("click", fetchAllData);
        $("settingsBtn").addEventListener("click", openSettingsModal);
        $("openSetupFromBanner").addEventListener("click", openSettingsModal);

        $("closeSettingsModal").addEventListener("click", () => $("settingsModal").classList.add("hidden"));
        $("closeDetailModal").addEventListener("click", () => $("detailModal").classList.add("hidden"));

        $("settingsModal").addEventListener("click", (e) => {
            if (e.target === $("settingsModal")) $("settingsModal").classList.add("hidden");
        });
        $("detailModal").addEventListener("click", (e) => {
            if (e.target === $("detailModal")) $("detailModal").classList.add("hidden");
        });

        $("saveSettingsBtn").addEventListener("click", () => {
            const url = $("firebaseUrlInput").value.trim().replace(/\/+$/, "");
            const auth = $("firebaseAuthInput").value.trim();
            localStorage.setItem(STORAGE_KEY_URL, url);
            localStorage.setItem(STORAGE_KEY_AUTH, auth);
            $("settingsModal").classList.add("hidden");
            fetchAllData();
        });

        $("clearSettingsBtn").addEventListener("click", () => {
            localStorage.removeItem(STORAGE_KEY_URL);
            localStorage.removeItem(STORAGE_KEY_AUTH);
            $("settingsModal").classList.add("hidden");
            fetchAllData();
        });

        $("searchInput").addEventListener("input", renderTable);
        $("chartRangeSelect").addEventListener("change", fetchAllData);
    }

    function startAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        const { refreshSec } = getSettings();
        refreshTimer = setInterval(fetchAllData, refreshSec * 1000);
    }

    setupEvents();
    fetchAllData();
    startAutoRefresh();
})();
