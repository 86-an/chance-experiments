// パチンコ シミュレーター
// 概要:
// - 通常抽選、確変(ST/ループ)、時短
// - 入力バリデーション、相互排他（STとループ）
// - 統計集計（最小/最大/平均/中央値/最頻値）
// - Chart.jsでグラフ描画

(function () {
	'use strict';

	// ユーティリティ: 統計（最適化版）
	const Stats = {
		min: (arr) => (arr.length ? Math.min(...arr) : 0),
		max: (arr) => (arr.length ? Math.max(...arr) : 0),
		mean: (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0),
		sum: (arr) => arr.reduce((a, b) => a + b, 0),
		median: (arr) => {
			if (!arr.length) return 0;
			const sorted = [...arr].sort((x, y) => x - y);
			const mid = Math.floor(sorted.length / 2);
			return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
		},
		mode: (arr) => {
			if (!arr.length) return 0;
			const freq = new Map();
			let maxCount = 0, mode = arr[0];
			for (const val of arr) {
				const count = (freq.get(val) || 0) + 1;
				freq.set(val, count);
				if (count > maxCount) {
					maxCount = count;
					mode = val;
				}
			}
			return mode;
		},
		// 複数統計を一度に計算（効率化）
		multiStats: (arr) => {
			if (!arr.length) return { min: 0, max: 0, mean: 0, sum: 0, median: 0, mode: 0 };
			const sorted = [...arr].sort((x, y) => x - y);
			const sum = arr.reduce((a, b) => a + b, 0);
			const mid = Math.floor(arr.length / 2);
			const median = arr.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
			
			const freq = new Map();
			let maxCount = 0, mode = arr[0];
			for (const val of arr) {
				const count = (freq.get(val) || 0) + 1;
				freq.set(val, count);
				if (count > maxCount) {
					maxCount = count;
					mode = val;
				}
			}
			
			return {
				min: sorted[0],
				max: sorted[sorted.length - 1],
				mean: sum / arr.length,
				sum,
				median,
				mode
			};
		}
	};

	// グラフハンドル
	const charts = {
		typeDist: null,
		entryRates: null,
		renchanHist: null,
		payoutProgress: null,
		profit: null,
	};

	// 入力相互排他（STとループ）
	function setupMutualExclusion() {
		const st = document.getElementById('contST');
		const loop = document.getElementById('contLoop');
		const onChange = () => {
			if (st.value) {
				loop.disabled = true;
			} else if (loop.value) {
				st.disabled = true;
			} else {
				st.disabled = false;
				loop.disabled = false;
			}
		};
		st.addEventListener('change', onChange);
		loop.addEventListener('change', onChange);
	}

	// 入力取得と検証
	function getAndValidateInputs() {
		const mode = parseInt(document.getElementById('mode').value, 10);
		const budgetPerDay = parseInt(document.getElementById('budgetPerDay').value, 10);
		const days = parseInt(document.getElementById('days').value, 10);
		const hitProbBase = parseInt(document.getElementById('hitProb').value, 10); // 1/x
		const kakuhenEntryPct = parseInt(document.getElementById('kakuhenEntry').value, 10); // %
		const kakuhenHitProbBase = parseInt(document.getElementById('kakuhenHitProb').value, 10); // 1/y
		const contSTPct = parseInt(document.getElementById('contST').value, 10) || null; // %
		const contLoopPct = parseInt(document.getElementById('contLoop').value, 10) || null; // %
		const jitanSpins = parseInt(document.getElementById('jitanSpins').value, 10);

		const errorEl = document.getElementById('error');

		// 必須入力チェック
		const missing = [mode, budgetPerDay, days, hitProbBase, kakuhenEntryPct, kakuhenHitProbBase, jitanSpins]
			.some((v) => Number.isNaN(v));
		const contBoth = contSTPct && contLoopPct; // 同時選択は不可
		const contNone = !contSTPct && !contLoopPct; // 少なくとも片方

		const rangeError = !(
			(mode === 1 || mode === 4) &&
			budgetPerDay >= 100 && budgetPerDay <= 1000000 &&
			days >= 1 && days <= 1000 &&
			[319, 199, 99].includes(hitProbBase) &&
			[50, 60, 70, 80].includes(kakuhenEntryPct) &&
			[30, 40, 50, 60, 70, 80, 90].includes(kakuhenHitProbBase) &&
			jitanSpins >= 10 && jitanSpins <= 1000
		);

		if (missing || contBoth || contNone || rangeError) {
			let msg = '入力エラーがあります。全ての項目を確認してください。';
			if (contBoth) msg = '継続率(ST)と継続率(ループ型)は同時に選択できません。どちらか一方のみ選択してください。';
			if (contNone) msg = '継続率はSTまたはループ型のどちらか一方を選択してください。';
			errorEl.textContent = msg;
			errorEl.style.display = 'block';
			return null;
		}

		errorEl.style.display = 'none';

		return {
			modeYen: mode,
			budgetPerDay,
			days,
			hitProb: 1 / hitProbBase,
			kakuhenEntry: kakuhenEntryPct / 100,
			kakuhenHitProb: 1 / kakuhenHitProbBase,
			isST: !!contSTPct,
			contRate: (contSTPct || contLoopPct) / 100,
			jitanSpins,
		};
	}

	// 1日のシミュレーション（リアル化版）
	function simulateOneDay(cfg) {
		// --- 回転効率のランダム化 ---
		// 1回転あたりの玉数（4〜6玉/回転）
		const spinsPerBall = 1 / (4 + Math.floor(Math.random() * 3)); // 4,5,6玉/回転
		const balls = Math.floor(cfg.budgetPerDay / cfg.modeYen);
		const spins = Math.floor(balls * spinsPerBall);

		let currentState = 'normal';
		let renchanCurrent = 0;
		let maxRenchan = 0;
		let totalHits = 0;
		let normalHits = 0;
		let kakuhenHits = 0;
		let kakuhenEntries = 0;
		let jitanEntries = 0;
		const renchanCounts = [];
		let payoutBalls = 0;
		let currentJitanLeft = 0;

		// --- 出玉期待値のランダム化 ---
		const payoutPerHitArr = [400, 600, 1000, 1500];

		const payoutProgress = [];
		const profitProgress = [];
		const investYen = cfg.budgetPerDay;

		const closeRenchan = () => {
			if (renchanCurrent > 0) {
				renchanCounts.push(renchanCurrent);
				maxRenchan = Math.max(maxRenchan, renchanCurrent);
				renchanCurrent = 0;
			}
		};

		for (let spin = 1; spin <= spins; spin++) {
			const pHit = (currentState === 'st' || currentState === 'loop') ? cfg.kakuhenHitProb : cfg.hitProb;
			if (Math.random() < pHit) {
				totalHits++;
				// 出玉をランダム化
				const payoutPerHit = payoutPerHitArr[Math.floor(Math.random() * payoutPerHitArr.length)];
				payoutBalls += payoutPerHit;
				renchanCurrent++;

				if (currentState === 'normal' || currentState === 'jitan') {
					normalHits++;
					if (Math.random() < cfg.kakuhenEntry) {
						kakuhenEntries++;
						currentState = cfg.isST ? 'st' : 'loop';
					} else {
						if (cfg.jitanSpins > 0) {
							jitanEntries++;
							currentState = 'jitan';
							currentJitanLeft = cfg.jitanSpins;
						} else {
							currentState = 'normal';
							closeRenchan();
						}
					}
				} else {
					kakuhenHits++;
					if (Math.random() < cfg.contRate) {
						// 連チャン継続
					} else {
						if (cfg.jitanSpins > 0) {
							jitanEntries++;
							currentState = 'jitan';
							currentJitanLeft = cfg.jitanSpins;
						} else {
							currentState = 'normal';
							closeRenchan();
						}
					}
				}
			} else {
				if (currentState === 'jitan') {
					currentJitanLeft--;
					if (currentJitanLeft <= 0) {
						currentState = 'normal';
						closeRenchan();
					}
				}
			}

			if (spin % Math.max(1, Math.floor(spins / 1000)) === 0 || spin === spins) {
				payoutProgress.push(payoutBalls);
				profitProgress.push(payoutBalls * cfg.modeYen - investYen);
			}
		}

		closeRenchan();

		return {
			spins,
			totalHits,
			normalHits,
			kakuhenHits,
			kakuhenEntries,
			jitanEntries,
			renchanCounts,
			maxRenchan,
			payoutBalls,
			profitYen: payoutBalls * cfg.modeYen - investYen,
			payoutProgress,
			profitProgress,
		};
	}

	// ヒストグラム用バケツ生成
	function toHistogram(counts) {
		const max = counts.length ? Math.max(...counts) : 0;
		const labels = Array.from({ length: max }, (_, i) => `${i + 1}連`);
		const data = Array.from({ length: max }, () => 0);
		for (const c of counts) if (c > 0) data[c - 1]++;
		return { labels, data };
	}

	// テーブル描画（最適化版）
	function renderBasicStats(daysResults) {
		const tbody = document.getElementById('basicStatsBody');
		const fragment = document.createDocumentFragment();

		const metrics = [
			{ key: 'spins', label: '総回転数' },
			{ key: 'totalHits', label: '総当たり数' },
			{ key: 'kakuhenEntries', label: '確変突入数' },
			{ key: 'jitanEntries', label: '時短突入数' },
			{ key: 'maxRenchan', label: '最大連チャン' },
			{ key: 'payoutBalls', label: '総出玉' },
			{ key: 'profitYen', label: '収支(円)' },
		];

		for (const m of metrics) {
			const arr = daysResults.map(r => r[m.key]);
			const stats = Stats.multiStats(arr);
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td>${m.label}</td>
				<td>${stats.min.toLocaleString()}</td>
				<td>${stats.max.toLocaleString()}</td>
				<td>${stats.mean.toFixed(2)}</td>
				<td>${stats.median.toLocaleString()}</td>
				<td>${stats.mode.toLocaleString()}</td>
				<td>${stats.sum.toLocaleString()}</td>
			`;
			fragment.appendChild(tr);
		}

		// 連チャン数（全日合算）
		const allRenchans = daysResults.flatMap(r => r.renchanCounts);
		const renStats = Stats.multiStats(allRenchans);
		const trRen = document.createElement('tr');
		trRen.innerHTML = `
			<td>連チャン数(平均)</td>
			<td colspan="5">${renStats.mean.toFixed(2)}</td>
			<td>${renStats.sum.toLocaleString()}</td>
		`;
		fragment.appendChild(trRen);

		tbody.innerHTML = '';
		tbody.appendChild(fragment);
	}

	// グラフ描画
	function drawCharts(daysResults) {
		// 1) 当たり種別分布
		const totalSpins = daysResults.reduce((s, r) => s + r.spins, 0);
		const totalNormalHits = daysResults.reduce((s, r) => s + r.normalHits, 0);
		const totalKakuhenHits = daysResults.reduce((s, r) => s + r.kakuhenHits, 0);
		const totalHits = totalNormalHits + totalKakuhenHits;
		const totalMiss = totalSpins - totalHits;

		destroyIfExist('typeDist');
		charts.typeDist = new Chart(document.getElementById('typeDistChart'), {
			type: 'pie',
			data: {
				labels: ['通常当たり', '確変当たり', 'ハズレ'],
				datasets: [{
					data: [totalNormalHits, totalKakuhenHits, totalMiss],
					backgroundColor: ['#42a5f5', '#ffa726', '#cfd8dc'],
					borderColor: ['#1e88e5', '#fb8c00', '#90a4ae'],
					borderWidth: 1,
				}],
			},
		});

		// 確変/時短 突入率
		const totalKakuhenEntries = daysResults.reduce((s, r) => s + r.kakuhenEntries, 0);
		const totalJitanEntries = daysResults.reduce((s, r) => s + r.jitanEntries, 0);
		destroyIfExist('entryRates');
		charts.entryRates = new Chart(document.getElementById('entryRatesChart'), {
			type: 'bar',
			data: {
				labels: ['確変突入', '時短突入'],
				datasets: [{
					label: '回数',
					data: [totalKakuhenEntries, totalJitanEntries],
					backgroundColor: ['#ff6b6b', '#66bb6a'],
				}],
			},
			options: { responsive: true, plugins: { legend: { display: false } } },
		});

		// 2) 連チャンヒストグラム
		const allRen = daysResults.flatMap((r) => r.renchanCounts);
		const hist = toHistogram(allRen);
		destroyIfExist('renchanHist');
		charts.renchanHist = new Chart(document.getElementById('renchanHistChart'), {
			type: 'bar',
			data: { labels: hist.labels, datasets: [{ label: '件数', data: hist.data, backgroundColor: '#42a5f5' }] },
			options: { responsive: true, plugins: { legend: { display: false } } },
		});

		// 3) 出玉推移（全日平均・最小・中央値・最頻値）
		const maxLen = Math.max(...daysResults.map((r) => r.payoutProgress.length));
		const payoutStats = Array.from({ length: maxLen }, (_, i) => {
			const vals = daysResults.map((r) => r.payoutProgress[i]).filter((x) => typeof x === 'number');
			return {
				mean: vals.length ? Stats.mean(vals) : null,
				min: vals.length ? Stats.min(vals) : null,
				median: vals.length ? Stats.median(vals) : null,
				mode: vals.length ? Stats.mode(vals) : null,
			};
		});
		destroyIfExist('payoutProgress');
		charts.payoutProgress = new Chart(document.getElementById('payoutProgressChart'), {
			type: 'line',
			data: {
				labels: payoutStats.map((_, i) => i + 1),
				datasets: [
					{ label: '平均', data: payoutStats.map(s => s.mean), borderColor: '#764ba2', backgroundColor: 'rgba(118,75,162,0.2)', spanGaps: true },
					{ label: '最小', data: payoutStats.map(s => s.min), borderColor: '#42a5f5', borderDash: [4,2], fill: false, spanGaps: true },
					{ label: '中央値', data: payoutStats.map(s => s.median), borderColor: '#ffa726', borderDash: [2,2], fill: false, spanGaps: true },
					{ label: '最頻値', data: payoutStats.map(s => s.mode), borderColor: '#66bb6a', borderDash: [8,2], fill: false, spanGaps: true },
				],
			},
			options: { responsive: true },
		});

		// 4) 収支推移（全日平均・最小・中央値・最頻値）
		const maxLenP = Math.max(...daysResults.map((r) => r.profitProgress.length));
		const profitStats = Array.from({ length: maxLenP }, (_, i) => {
			const vals = daysResults.map((r) => r.profitProgress[i]).filter((x) => typeof x === 'number');
			return {
				mean: vals.length ? Stats.mean(vals) : null,
				min: vals.length ? Stats.min(vals) : null,
				median: vals.length ? Stats.median(vals) : null,
				mode: vals.length ? Stats.mode(vals) : null,
			};
		});
		destroyIfExist('profit');
		charts.profit = new Chart(document.getElementById('profitChart'), {
			type: 'line',
			data: {
				labels: profitStats.map((_, i) => i + 1),
				datasets: [
					{ label: '平均', data: profitStats.map(s => s.mean), borderColor: '#66bb6a', backgroundColor: 'rgba(102,187,106,0.2)', spanGaps: true },
					{ label: '最小', data: profitStats.map(s => s.min), borderColor: '#42a5f5', borderDash: [4,2], fill: false, spanGaps: true },
					{ label: '中央値', data: profitStats.map(s => s.median), borderColor: '#ffa726', borderDash: [2,2], fill: false, spanGaps: true },
					{ label: '最頻値', data: profitStats.map(s => s.mode), borderColor: '#764ba2', borderDash: [8,2], fill: false, spanGaps: true },
				],
			},
			options: { responsive: true },
		});
	}

	function destroyIfExist(key) {
		const c = charts[key];
		if (c) { c.destroy(); charts[key] = null; }
	}

	// メイン実行（最適化版）
	window.runPachinkoSimulation = async function () {
		const cfg = getAndValidateInputs();
		if (!cfg) return;

		console.group('パチンコ シミュレーション 入力値');
		console.table({
			modeYen: cfg.modeYen,
			budgetPerDay: cfg.budgetPerDay,
			days: cfg.days,
			hitProb: `1/${(1 / cfg.hitProb).toFixed(0)}`,
			kakuhenEntry: `${(cfg.kakuhenEntry * 100).toFixed(0)}%`,
			kakuhenHitProb: `1/${(1 / cfg.kakuhenHitProb).toFixed(0)}`,
			mode: cfg.isST ? 'ST' : 'ループ',
			contRate: `${(cfg.contRate * 100).toFixed(0)}%`,
			jitanSpins: cfg.jitanSpins,
		});
		console.groupEnd();

		// 進捗表示の準備
		const errorEl = document.getElementById('error');
		if (cfg.days > 100) {
			errorEl.textContent = `大量データ処理中... (${cfg.days}日)`;
			errorEl.style.display = 'block';
			errorEl.style.color = '#4a90e2';
			errorEl.style.background = '#e3f2fd';
		}

		const daysResults = [];
		console.time('simulateAllDays');

		// 大量データの場合は非同期処理でUIブロックを防ぐ
		const batchSize = cfg.days > 1000 ? 100 : cfg.days;
		for (let batch = 0; batch < cfg.days; batch += batchSize) {
			const endDay = Math.min(batch + batchSize, cfg.days);
			
			for (let d = batch; d < endDay; d++) {
				const res = simulateOneDay(cfg);
				daysResults.push(res);
				
				if (cfg.days <= 10) {
					console.group(`Day ${d + 1} 結果`);
					console.table({
						spins: res.spins,
						totalHits: res.totalHits,
						normalHits: res.normalHits,
						kakuhenHits: res.kakuhenHits,
						kakuhenEntries: res.kakuhenEntries,
						jitanEntries: res.jitanEntries,
						maxRenchan: res.maxRenchan,
						payoutBalls: res.payoutBalls,
						profitYen: res.profitYen,
					});
					console.groupEnd();
				}
			}

			// 進捗更新とUIレスポンス維持
			if (cfg.days > 100) {
				const progress = Math.round((endDay / cfg.days) * 100);
				errorEl.textContent = `処理中... ${progress}% (${endDay}/${cfg.days}日)`;
				await new Promise(resolve => setTimeout(resolve, 1));
			}
		}

		console.timeEnd('simulateAllDays');
		errorEl.style.display = 'none';

		// 集計をコンソール出力（最適化版）
		const aggMetrics = ['spins', 'totalHits', 'kakuhenEntries', 'jitanEntries', 'maxRenchan', 'payoutBalls', 'profitYen'];
		const agg = {};
		for (const metric of aggMetrics) {
			agg[metric] = Stats.multiStats(daysResults.map(r => r[metric]));
		}

		console.group('集計サマリー');
		console.table(agg);
		console.groupEnd();

		// テーブル/グラフ描画
		console.time('renderResults');
		renderBasicStats(daysResults);
		drawCharts(daysResults);
		console.timeEnd('renderResults');

		document.getElementById('results').style.display = 'block';
	};

	// セレクトボックスの動的生成（最適化版）
	function updateDynamicSelectors() {
		// DOM操作を最小化するため、innerHTML一括設定
		const budgetOptions = ['<option value="">選択してください</option>'];
		const commonBudgets = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
		for (const val of commonBudgets) {
			budgetOptions.push(`<option value="${val}">${val.toLocaleString()}</option>`);
		}
		document.getElementById('budgetPerDay').innerHTML = budgetOptions.join('');

		const daysOptions = ['<option value="">選択してください</option>'];
		const commonDays = [1, 5, 10, 20, 30, 50, 100, 200, 365, 500, 1000];
		for (const val of commonDays) {
			daysOptions.push(`<option value="${val}">${val.toLocaleString()}</option>`);
		}
		document.getElementById('days').innerHTML = daysOptions.join('');

		const jitanOptions = ['<option value="">選択してください</option>'];
		const commonJitan = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000];
		for (const val of commonJitan) {
			jitanOptions.push(`<option value="${val}">${val.toLocaleString()}</option>`);
		}
		document.getElementById('jitanSpins').innerHTML = jitanOptions.join('');
	}

	// グローバルに公開
	window.updateDynamicSelectors = updateDynamicSelectors;

	// 起動時セットアップ
	document.addEventListener('DOMContentLoaded', () => {
		setupMutualExclusion();
		updateDynamicSelectors();
	});
})();

