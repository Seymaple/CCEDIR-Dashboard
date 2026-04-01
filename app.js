// Global State
let sessionsData = [];
// colors
const colors = {
    instructor: '#3b82f6',
    student: '#10b981',
    system: '#94a3b8',
    generic: [
        '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
        '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'
    ]
};

// Charts references
let overviewPieChart, overviewBarChart;
let dayTimelineChart, dayFocusChart, dayBarChart;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-upload');
const fileCountPill = document.getElementById('file-count-pill');
const headerTotalSessionsText = document.getElementById('header-total-sessions-text');
const navItems = document.querySelectorAll('.nav-item');
const viewPanels = document.querySelectorAll('.view-panel');
const viewTitle = document.getElementById('view-title');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const refreshBtn = document.getElementById('refresh-btn');
const daySelect = document.getElementById('day-select');
const commentDaySelect = document.getElementById('comment-day-select');
const commentsContainer = document.getElementById('comments-container');
const questionTypeSelect = document.getElementById('question-type-select');
const questionsContainer = document.getElementById('questions-container');

// Global state for questions
let currentQuestionEvents = [];

// Chart Defaults
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.register(ChartDataLabels);

// --- Theme Management ---
const themeSelect = document.getElementById('theme-select');
if (themeSelect) {
    const savedTheme = localStorage.getItem('ccedir-theme') || 'default';
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

    themeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });
}

function applyTheme(themeName) {
    if (themeName === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
    localStorage.setItem('ccedir-theme', themeName);

    // Update global chart defaults and force redraw
    setTimeout(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const textColor = rootStyle.getPropertyValue('--text-secondary').trim() || '#64748b';
        const borderColor = rootStyle.getPropertyValue('--surface-border').trim() || 'rgba(0, 0, 0, 0.04)';
        
        colors.instructor = rootStyle.getPropertyValue('--accent-primary').trim() || '#fe5678';
        colors.student = rootStyle.getPropertyValue('--accent-secondary').trim() || '#22d3ee';

        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = borderColor;

        if (overviewPieChart) overviewPieChart.update();
        if (overviewBarChart) overviewBarChart.update();
        if (dayTimelineChart) dayTimelineChart.update();
        if (dayBarChart) dayBarChart.update();

        // Completely rebuild active view to ensure all dynamic colors apply immediately
        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav) {
            const activeId = activeNav.getAttribute('data-view');
            if (activeId === 'overview') updateOverview();
            if (activeId === 'day-by-day') updateDayView();
            if (activeId === 'comments') updateCommentsView();
        }

    }, 50);
}

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        window.location.reload();
    });
}
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        const viewId = item.getAttribute('data-view');

        viewPanels.forEach(panel => {
            if (panel.id === 'view-' + viewId) {
                panel.classList.add('active');
                panel.style.display = 'block';
            } else {
                panel.classList.remove('active');
                panel.style.display = 'none';
            }
        });

        const logoEl = document.getElementById('overview-top-banner');

        if (viewId === 'overview') {
            viewTitle.textContent = 'Course Overview';
            if (logoEl) logoEl.style.display = 'block';
            updateOverview();
        } else if (viewId === 'day-by-day') {
            viewTitle.textContent = 'Day by Day Breakdown';
            if (logoEl) logoEl.style.display = 'none';
            updateDayView();
        } else if (viewId === 'comments') {
            viewTitle.textContent = 'Session Comments';
            if (logoEl) logoEl.style.display = 'none';
            updateCommentsView();
        }
    });
});

// --- File Handling ---
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFiles(e.target.files);
    }
});

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.csv')) {
            sessionsData = []; // Replace old runs
            daySelect.innerHTML = '<option value="" disabled selected>No data loaded</option>';
            commentDaySelect.innerHTML = '<option value="" disabled selected>No data loaded</option>';
            parseCSVFile(file);
        } else {
            alert('Only CSV files are supported!');
        }
    }
}

function parseCSVFile(file) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            processSessionData(file.name, results.data);
            addFileToList(file.name);
            updateDashboard();
        }
    });
}

function addFileToList(filename) {
    if (fileCountPill) {
        fileCountPill.style.display = 'flex';
        if (headerTotalSessionsText) {
            headerTotalSessionsText.textContent = `${sessionsData.length} file(s) loaded`;
        }
    }
}

// --- Data Processing ---
function processSessionData(filename, rows) {
    // Basic clean to remove entirely empty rows or missing timestamp
    const cleanRows = rows.filter(r => r.Timestamp && r.Timestamp.trim() !== '');

    // Sort by timestamp just in case
    cleanRows.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    let events = [];
    let sessionTotalMs = 0;

    for (let i = 0; i < cleanRows.length; i++) {
        const row = cleanRows[i];

        // Find end time for this event
        let endTime = null;
        if (i < cleanRows.length - 1) {
            endTime = new Date(cleanRows[i + 1].Timestamp);
        } else {
            // If it's the last row, usually "End Session" System event. Duration is 0 or default 1s.
            endTime = new Date(new Date(row.Timestamp).getTime() + 1000);
        }

        const startTime = new Date(row.Timestamp);
        let durationMs = endTime - startTime;
        if (durationMs < 0) durationMs = 0; // Sanity check

        row.DurationMs = durationMs;
        row.StartTime = startTime;
        row.EndTime = endTime;

        // If it's a System END event, don't count duration towards session total unless it's the only logic
        if (row.Type !== 'System' || row.Code !== 'END') {
            sessionTotalMs += durationMs;
            events.push(row);
        }
    }

    const sessionObj = {
        id: Date.now() + '_' + Math.floor(Math.random() * 1000),
        filename: filename,
        dateStr: events.length > 0 ? events[0].StartTime.toLocaleDateString() : 'Unknown Date',
        events: events,
        totalMs: sessionTotalMs
    };

    sessionsData.push(sessionObj);

    // Add to dropdown
    const opt = document.createElement('option');
    opt.value = sessionObj.id;
    opt.textContent = `${filename} (${sessionObj.dateStr})`;
    daySelect.appendChild(opt);

    const optC = document.createElement('option');
    optC.value = sessionObj.id;
    optC.textContent = `${filename} (${sessionObj.dateStr})`;
    commentDaySelect.appendChild(optC);

    // Select first by default if nothing selected
    if (daySelect.value === "") {
        daySelect.value = sessionObj.id;
        commentDaySelect.value = sessionObj.id;
    }
}

// --- Dashboard Updating ---
function updateDashboard() {
    const activeView = document.querySelector('.nav-item.active').getAttribute('data-view');
    if (activeView === 'overview') {
        updateOverview();
    } else if (activeView === 'day-by-day') {
        updateDayView();
    } else if (activeView === 'comments') {
        updateCommentsView();
    }
}

// FORMATTING UTILS
function formatMsToTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

// OVERVIEW VIEW LOGIC
function updateOverview() {
    if (sessionsData.length === 0) return;

    let totalMs = 0;
    let instMs = 0;
    let studMs = 0;
    let instCount = 0;
    let studCount = 0;
    let targetEvents = 0;
    let activityMap = {};
    let activityCountMap = {};

    sessionsData.forEach(session => {
        totalMs += session.totalMs;
        session.events.forEach(ev => {
            targetEvents++;

            if (ev.Focus === 'Instructor') {
                instMs += ev.DurationMs;
                instCount++;
            } else if (ev.Focus === 'Student') {
                studMs += ev.DurationMs;
                studCount++;
            }

            const desc = ev.Description || ev.Code || 'Unknown';
            if (desc) {
                activityMap[desc] = (activityMap[desc] || 0) + ev.DurationMs;
                activityCountMap[desc] = (activityCountMap[desc] || 0) + 1;
            }
        });
    });

    document.getElementById('kpi-total-time').textContent = formatMsToTime(totalMs);
    document.getElementById('kpi-total-events').textContent = targetEvents;

    // width for bars
    const totalFocusMs = instMs + studMs;
    if (totalFocusMs > 0) {
        let instWidth = Math.round((instMs / totalFocusMs) * 100);
        let studWidth = Math.round((studMs / totalFocusMs) * 100);

        const instEL = document.getElementById('kpi-instructor-focus');
        const studEL = document.getElementById('kpi-student-focus');
        if (instEL) instEL.textContent = instWidth + '%';
        if (studEL) studEL.textContent = studWidth + '%';

        const instBar = document.getElementById('kpi-bar-inst');
        const studBar = document.getElementById('kpi-bar-stud');
        if (instBar) instBar.style.width = instWidth + '%';
        if (studBar) studBar.style.width = studWidth + '%';
    }

    const allSortedActivities = Object.keys(activityMap).sort((a, b) => activityMap[b] - activityMap[a]);
    const topActivityEl = document.getElementById('kpi-top-activity');
    if (topActivityEl) {
        if (allSortedActivities.length > 0) {
            const maxDurationMs = activityMap[allSortedActivities[0]];
            const topTies = allSortedActivities.filter(activity => activityMap[activity] === maxDurationMs);
            // Include a smaller duration label so the user knows the biggest activity block
            topActivityEl.innerHTML = `${topTies.join(', ')} <span style="font-size: 1.1rem; color: var(--text-secondary); opacity: 0.8; margin-left: 0.2rem;">(${formatMsToTime(maxDurationMs)})</span>`;
        } else {
            topActivityEl.textContent = '-';
        }
    }

    // Prepare pie chart
    const pieData = [instMs, studMs];
    const pieCounts = [instCount, studCount];
    if (overviewPieChart) overviewPieChart.destroy();
    overviewPieChart = new Chart(document.getElementById('focusPieChart'), {
        type: 'doughnut',
        data: {
            labels: ['Instructor', 'Student'],
            datasets: [{
                data: pieData,
                backgroundColor: [colors.instructor, colors.student],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                label += formatMsToTime(context.raw);
                                label += ` (${pieCounts[context.dataIndex]} entries)`;
                            }
                            return label;
                        }
                    }
                },
                legend: { position: 'bottom' },
                datalabels: {
                    color: '#000',
                    formatter: (value, ctx) => {
                        let sum = ctx.chart._metasets[0].total;
                        let percentage = Math.round(value / sum * 100);
                        return percentage > 3 ? percentage + '%' : '';
                    },
                    font: { weight: 'bold', size: 14 },
                    anchor: 'center',
                    align: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    borderRadius: 4,
                    borderColor: '#000',
                    borderWidth: 0.5,
                    padding: { top: 2, bottom: 2, left: 5, right: 5 }
                }
            }
        }
    });

    // Prepare Bar Chart
    const sortedActivitiesCount = allSortedActivities;
    const barDataMinutes = sortedActivitiesCount.map(k => Number((activityMap[k] / 60000).toFixed(1))); // Duration in minutes

    const chartColors = sortedActivitiesCount.map((_, i) => colors.generic[i % colors.generic.length]);

    // Adjust layout for many categories so it expands fully
    const overviewBarContainer = document.getElementById('activityBarChart')?.parentElement;

    if (overviewBarContainer) {
        overviewBarContainer.style.height = '500px';
    }

    if (overviewBarChart) overviewBarChart.destroy();
    overviewBarChart = new Chart(document.getElementById('activityBarChart'), {
        type: 'bar',
        data: {
            labels: sortedActivitiesCount,
            datasets: [{
                label: 'Duration (minutes)',
                data: barDataMinutes,
                backgroundColor: chartColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { right: 30 }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Activity Category', font: { size: 14, weight: '700' } },
                    grid: { display: false },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: false,
                        font: { size: 13, weight: '700' },
                        color: '#000'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Duration (minutes)', font: { size: 14, weight: '700' } },
                    grid: { borderDash: [4, 4] },
                    ticks: {
                        callback: value => `${value}m`,
                        font: { size: 13, weight: '600' },
                        color: '#000'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const activity = ctx.label;
                            const activityMs = (activityMap[activity] || 0);
                            const percentage = totalMs ? ((activityMs / totalMs) * 100).toFixed(1) : '0.0';
                            return `Duration: ${formatMsToTime(activityMs)} (${percentage}%)`;
                        }
                    }
                },
                datalabels: { display: false }
            }
        }
    });
}

// DAY BY DAY LOGIC
daySelect.addEventListener('change', updateDayView);

function updateDayView() {
    const selId = daySelect.value;
    if (!selId) return;

    const session = sessionsData.find(s => s.id === selId);
    if (!session) return;

    let instMs = 0;
    let studMs = 0;
    let activityMap = {};

    session.events.forEach(ev => {
        if (ev.Focus === 'Instructor') instMs += ev.DurationMs;
        else if (ev.Focus === 'Student') studMs += ev.DurationMs;

        const desc = ev.Description || ev.Code || 'Unknown';
        activityMap[desc] = (activityMap[desc] || 0) + ev.DurationMs;
    });

    const sortedActivities = Object.keys(activityMap).sort((a, b) => activityMap[b] - activityMap[a]);

    // Timeline Chart (Gantt style exactly like Example 3)
    const uniqueActivities = [...new Set(session.events.map(e => e.Activity || e.Description || e.Code))];

    // Update Categories Used KPI
    const categoriesUsedEl = document.getElementById('day-categories-used');
    if (categoriesUsedEl) {
        categoriesUsedEl.textContent = uniqueActivities.length;
    }

    const timelineData = session.events.map(e => {
        return {
            x: [e.StartTime.getTime(), e.EndTime.getTime()],
            y: e.Activity || e.Description || e.Code,
            focus: e.Focus
        };
    });

    const getTimelineColor = (focus) => {
        if (focus === 'Instructor') return colors.instructor; 
        if (focus === 'Student') return colors.student; 
        return colors.system; 
    };

    if (dayTimelineChart) dayTimelineChart.destroy();
    dayTimelineChart = new Chart(document.getElementById('dayTimelineChart'), {
        type: 'bar',
        data: {
            datasets: [{
                data: timelineData,
                backgroundColor: (ctx) => {
                    const focus = ctx.raw?.focus;
                    return getTimelineColor(focus);
                },
                barPercentage: 0.5,
                categoryPercentage: 1.0
            }]
        },
        options: {
            indexAxis: 'y', // This makes it a horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: { display: true, text: 'Timestamp (EST)' },
                    grid: { borderDash: [4, 4] }
                },
                y: {
                    type: 'category',
                    labels: uniqueActivities, // y-axis categories based on all available activities
                    title: { display: true, text: 'Activity', font: { size: 15, weight: '700' } },
                    ticks: { font: { size: 14, weight: '700' }, color: '#000' },
                    grid: { display: true }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (ctx) => {
                            return ctx[0].raw.y;
                        },
                        label: (ctx) => {
                            const start = new Date(ctx.raw.x[0]);
                            const end = new Date(ctx.raw.x[1]);
                            const durationMs = end - start;
                            const timeStr = `${start.getHours()}:${start.getMinutes().toString().padStart(2, '0')} - ${end.getHours()}:${end.getMinutes().toString().padStart(2, '0')}`;
                            const sessionDurationMs = session.totalMs || 0;
                            const percentage = sessionDurationMs ? ((durationMs / sessionDurationMs) * 100).toFixed(1) : '0.0';

                            return [
                                `Time range: ${timeStr}`,
                                `Duration: ${formatMsToTime(durationMs)} (${percentage}%)`,
                                `Focus: ${ctx.raw.focus}`
                            ];
                        }
                    }
                },
                datalabels: { display: false }
            }
        }
    });

    // Make the chart container taller if there are many activities to give space for the y-axis
    const timelineWrap = document.querySelector('.timeline-chart-wrapper');
    if (timelineWrap) {
        timelineWrap.style.height = Math.max(250, uniqueActivities.length * 35 + 60) + 'px';
    }

    // Focus Pie (Removed from HTML, so removed from JS)
    // Day Bar Chart (Re-designed for Example Four/Five aesthetic)
    const focusActivityMap = {
        'Instructor': {},
        'Student': {}
    };

    session.events.forEach(ev => {
        const desc = ev.Activity || ev.Description || ev.Code || 'Unknown';
        const focus = ev.Focus || 'Instructor';
        if (!focusActivityMap[focus]) focusActivityMap[focus] = {};
        focusActivityMap[focus][desc] = (focusActivityMap[focus][desc] || 0) + ev.DurationMs;
    });

    const allActivitiesMap = [...new Set(session.events.map(ev => ev.Activity || ev.Description || ev.Code || 'Unknown'))];

    // Convert Ms to Mins for datasets
    const instData = allActivitiesMap.map(k => (focusActivityMap['Instructor'][k] || 0) / 60000);
    const studData = allActivitiesMap.map(k => (focusActivityMap['Student'][k] || 0) / 60000);

    const dayActivityCanvas = document.getElementById('dayActivityChart');
    if (dayActivityCanvas && dayActivityCanvas.parentElement) {
        dayActivityCanvas.parentElement.style.height = Math.max(300, allActivitiesMap.length * 40 + 60) + 'px';
    }

    if (dayBarChart) dayBarChart.destroy();
    dayBarChart = new Chart(document.getElementById('dayActivityChart'), {
        type: 'bar',
        data: {
            labels: allActivitiesMap,
            datasets: [
                {
                    label: 'Instructor Focus',
                    data: instData,
                    backgroundColor: colors.instructor,
                    borderRadius: 4
                },
                {
                    label: 'Student Focus',
                    data: studData,
                    backgroundColor: colors.student,
                    borderRadius: 4
                }
            ]
        },
        options: {
            indexAxis: 'y', // Horizontal bars
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    beginAtZero: true,
                    title: { display: true, text: 'Time duration (mins)' },
                    grid: { borderDash: [4, 4] }
                },
                y: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                datalabels: { display: false }
            }
        }
    });

    // Populate day-specific total time list
    const container = document.getElementById('activity-times-container');
    if (container) {
        container.innerHTML = '';
        sortedActivities.forEach((desc) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '1rem 1.5rem';
            row.style.background = 'var(--glass-bg)';
            row.style.borderRadius = '8px';
            row.style.border = '1px solid var(--glass-border)';
            row.style.marginBottom = '0.5rem';
            row.style.boxShadow = 'var(--shadow-soft)';
            
            row.innerHTML = `
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1.1rem;">${desc}</span>
                <span style="font-weight: 700; color: var(--accent-primary); font-size: 1.2rem; background: var(--surface-color); padding: 0.25rem 0.75rem; border-radius: 12px; box-shadow: var(--shadow-soft);">${formatMsToTime(activityMap[desc])}</span>
            `;
            container.appendChild(row);
        });
        
        if (sortedActivities.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">No data loaded</div>';
        }
    }
}

// COMMENTS VIEW LOGIC
commentDaySelect.addEventListener('change', updateCommentsView);
if (questionTypeSelect) {
    questionTypeSelect.addEventListener('change', updateCommentsView);
}

function updateCommentsView() {
    const selId = commentDaySelect.value;
    if (!selId) return;

    const session = sessionsData.find(s => s.id === selId);
    if (!session) return;

    commentsContainer.innerHTML = '';

    // Determine unique activities in this session to populate filter
    const uniqueActs = [...new Set(session.events.map(e => e.Activity || e.Description || e.Code))].sort();

    let currentFilterVal = 'all';
    if (questionTypeSelect && questionTypeSelect.value) {
        currentFilterVal = questionTypeSelect.value;
    }

    if (questionTypeSelect) {
        questionTypeSelect.innerHTML = '<option value="all">All Activities (with comments)</option>';
        const optNoComments = document.createElement('option');
        optNoComments.value = 'all_everything';
        optNoComments.textContent = 'All Activities (everything)';
        questionTypeSelect.appendChild(optNoComments);

        uniqueActs.forEach(act => {
            const opt = document.createElement('option');
            opt.value = act;
            opt.textContent = act;
            questionTypeSelect.appendChild(opt);
        });
        
        // Restore filter if it still exists in this session
        const hasMatch = [...questionTypeSelect.options].some(o => o.value === currentFilterVal);
        if (hasMatch) {
            questionTypeSelect.value = currentFilterVal;
        } else {
            questionTypeSelect.value = 'all';
        }
    }

    const filterVal = questionTypeSelect ? questionTypeSelect.value : 'all';
    let filteredEvents = [];

    if (filterVal === 'all') {
        filteredEvents = session.events.filter(e => e.TextValue && e.TextValue.trim() !== '');
    } else if (filterVal === 'all_everything') {
        filteredEvents = session.events;
    } else {
        filteredEvents = session.events.filter(e => {
            const desc = e.Activity || e.Description || e.Code || 'Unknown';
            return desc === filterVal;
        });
    }

    if (filteredEvents.length === 0) {
        let msg = 'No comments recorded for this session.';
        if (filterVal !== 'all' && filterVal !== 'all_everything') {
            msg = `No occurrences found for "${filterVal}".`;
        }
        commentsContainer.innerHTML = `<div class="glass comments-empty" style="padding: 2rem; text-align: center; color: var(--text-secondary); box-shadow: none; background: transparent;">${msg}</div>`;
        return;
    }

    filteredEvents.forEach(e => {
        const d = e.StartTime;
        const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;

        const card = document.createElement('div');
        card.className = `comment-card glass ${e.Focus === 'Instructor' ? 'Inst' : (e.Focus === 'Student' ? 'Stud' : '')}`;

        let textValHtml = '';
        if (e.TextValue && e.TextValue.trim() !== '') {
            if (filterVal !== 'all') {
                textValHtml = `<div class="text" style="margin-top: 0.5rem; background: rgba(0,0,0,0.03); padding: 0.5rem; border-radius: 4px;">${e.TextValue}</div>`;
            } else {
                textValHtml = `<div class="text">${e.TextValue}</div>`;
            }
        }

        card.innerHTML = `
            <div class="meta" style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                <span class="focus" style="color: ${e.Focus === 'Instructor' ? colors.instructor : (e.Focus === 'Student' ? colors.student : colors.system)}; font-weight: 600;">${e.Focus || 'General'} Focus</span>
                <span class="time" style="color: var(--text-secondary); font-size: 0.85rem;">${session.dateStr} | ${timeStr}</span>
            </div>
            <div class="meta" style="color: var(--text-primary); font-weight: 500;">
                <span>${e.Activity || e.Description || e.Code}</span>
            </div>
            ${textValHtml}
        `;
        commentsContainer.appendChild(card);
    });
}

// --- PDF DOWNLOAD ---
if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', async () => {
        if (sessionsData.length === 0) {
            alert('Please upload a file first!');
            return;
        }

        const activeViewId = document.querySelector('.nav-item.active').getAttribute('data-view');
        const mainContent = document.querySelector('.main-content');

        // Hide controls temporarily
        downloadPdfBtn.style.display = 'none';
        document.querySelector('.upload-dropdown').style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';

        // Hide sidebar and original header container
        const sidebar = document.querySelector('.sidebar');
        const originalSidebarDisplay = sidebar.style.display;
        sidebar.style.display = 'none';

        // Target specifically the Overview container and the Day by Day container
        const viewOverview = document.getElementById('view-overview');
        const viewDay = document.getElementById('view-day-by-day');

        viewPanels.forEach(panel => {
            panel.classList.remove('active');
            panel.style.display = 'none';
        });

        const banner = document.getElementById('overview-top-banner');
        let originalBannerMargin = '';
        let originalBannerPadding = '';
        let originalLogoMargin = '';
        if (banner) {
            banner.style.display = 'block';
            originalBannerMargin = banner.style.margin;
            originalBannerPadding = banner.style.padding;

            const logo = banner.querySelector('img');
            // Leaving the logo exactly where it normally is
        }

        // Constrain width to a standard desktop size for consistent PDF scaling
        // Remove padding and margin so it perfectly fills the PDF document space
        const originalWidth = mainContent.style.width;
        const originalMaxWidth = mainContent.style.maxWidth;
        const originalMargin = mainContent.style.margin;
        const originalMarginLeft = mainContent.style.marginLeft;
        const originalPadding = mainContent.style.padding;

        mainContent.style.width = '1200px';
        mainContent.style.maxWidth = '1200px';
        mainContent.style.margin = '0';
        mainContent.style.marginLeft = '0';
        mainContent.style.padding = '1.5rem 2rem'; // Keep content from touching exact edges
        mainContent.style.backgroundColor = '#f7f6f2'; // Ensure full opacity backdrop for JPEG conversion

        // We will take two separate pictures by capturing EXACT container chunks
        // ------------------------------------
        try {
            const { jsPDF } = window.jspdf;

            // Standard printer landscape size
            const pdf = new jsPDF('l', 'in', 'letter');
            const pageWidth = 11;
            const pageHeight = 8.5;
            const margin = 0.25;
            const maxW = pageWidth - margin * 2;
            const maxH = pageHeight - margin * 2;

            // Fix the title dynamically so it doesn't say "Day by Day" on the Overview page
            const viewTitle = document.getElementById('view-title');
            const originalTitleBtn = viewTitle ? viewTitle.textContent : '';

            // Wait for styles and grids to settle before first snapshot
            await new Promise(r => setTimeout(r, 600));

            // --- PAGE 1: Overview ---
            if (viewTitle) viewTitle.textContent = 'Course Overview';
            // Render specific sub-divs avoiding general main body
            viewOverview.classList.add('active');
            viewOverview.style.display = 'block';
            if (overviewPieChart) { overviewPieChart.resize(); overviewPieChart.update('none'); }
            if (overviewBarChart) { overviewBarChart.resize(); overviewBarChart.update('none'); }

            await new Promise(r => setTimeout(r, 600)); // reflow chart sizing

            // We MUST explicitly pass windowWidth so small browser windows don't instantly clip the screenshot!
            const canvas1 = await html2canvas(mainContent, {
                scale: 2,
                useCORS: true,
                windowWidth: 1200,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-color').trim() || '#f7f6f2'
            });
            const imgData1 = canvas1.toDataURL('image/jpeg', 1.0);

            // Scale perfectly to fit inside generic printable bounds
            const imgProps1 = pdf.getImageProperties(imgData1);
            const scale1 = Math.min(maxW / imgProps1.width, maxH / imgProps1.height);
            const finalW1 = imgProps1.width * scale1;
            const finalH1 = imgProps1.height * scale1;
            const xOffset1 = (pageWidth - finalW1) / 2; // Center horizontally

            pdf.addImage(imgData1, 'JPEG', xOffset1, margin, finalW1, finalH1);

            // --- PAGE 2: Day by Day (Timeline Only) ---
            if (viewTitle) viewTitle.textContent = 'Day by Day Breakdown';
            viewOverview.classList.remove('active');
            viewOverview.style.height = '0';
            viewOverview.style.overflow = 'hidden';

            if (banner) banner.style.display = 'none';

            viewDay.classList.add('active');
            viewDay.style.display = 'block';

            // Isolate timeline section for page 2
            const dayTimelineSection = document.getElementById('day-timeline-section');
            const dayActivitiesSection = document.getElementById('day-activities-section');
            if (dayActivitiesSection) dayActivitiesSection.style.display = 'none';
            if (dayTimelineSection) dayTimelineSection.style.display = '';

            if (dayTimelineChart) { dayTimelineChart.resize(); dayTimelineChart.update('none'); }

            await new Promise(r => setTimeout(r, 600));

            const canvas2 = await html2canvas(mainContent, {
                scale: 2,
                useCORS: true,
                windowWidth: 1200,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-color').trim() || '#f7f6f2'
            });

            const imgData2 = canvas2.toDataURL('image/jpeg', 1.0);
            const imgProps2 = pdf.getImageProperties(imgData2);
            const scale2 = Math.min(maxW / imgProps2.width, maxH / imgProps2.height);
            const finalW2 = imgProps2.width * scale2;
            const finalH2 = imgProps2.height * scale2;
            const xOffset2 = (pageWidth - finalW2) / 2;

            pdf.addPage();
            pdf.addImage(imgData2, 'JPEG', xOffset2, margin, finalW2, finalH2);

            // --- PAGE 3: Day by Day (Activities Only) ---
            // Swap visibility
            if (dayTimelineSection) dayTimelineSection.style.display = 'none';
            if (dayActivitiesSection) dayActivitiesSection.style.display = '';

            const activityTimesContainer = document.getElementById('activity-times-container');
            let originalMaxHeight = '';
            let originalOverflow = '';
            if (activityTimesContainer) {
                originalMaxHeight = activityTimesContainer.style.maxHeight;
                originalOverflow = activityTimesContainer.style.overflowY;
                activityTimesContainer.style.maxHeight = 'none';
                activityTimesContainer.style.overflowY = 'visible';
            }

            if (dayBarChart) { dayBarChart.resize(); dayBarChart.update('none'); }

            await new Promise(r => setTimeout(r, 600));

            const canvas3 = await html2canvas(mainContent, {
                scale: 2,
                useCORS: true,
                windowWidth: 1200,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-color').trim() || '#f7f6f2'
            });

            // Restore after screenshot
            if (activityTimesContainer) {
                activityTimesContainer.style.maxHeight = originalMaxHeight;
                activityTimesContainer.style.overflowY = originalOverflow;
            }

            const imgData3 = canvas3.toDataURL('image/jpeg', 1.0);
            const imgProps3 = pdf.getImageProperties(imgData3);
            const scale3 = Math.min(maxW / imgProps3.width, maxH / imgProps3.height);
            const finalW3 = imgProps3.width * scale3;
            const finalH3 = imgProps3.height * scale3;
            const xOffset3 = (pageWidth - finalW3) / 2;

            pdf.addPage();
            pdf.addImage(imgData3, 'JPEG', xOffset3, margin, finalW3, finalH3);

            // Download final document
            pdf.save('CCEDIR_Report.pdf');

        } catch (error) {
            console.error("PDF generation error: ", error);
            alert("Error downloading PDF. Check browser console.");
        } finally {
            // Remove our single-target print overrides
            document.body.classList.remove('pdf-export');

            // Restore styles
            mainContent.style.width = originalWidth;
            mainContent.style.maxWidth = originalMaxWidth;
            mainContent.style.margin = originalMargin;
            mainContent.style.marginLeft = originalMarginLeft;
            mainContent.style.padding = originalPadding;
            mainContent.style.backgroundColor = '';

            if (banner) {
                banner.style.margin = originalBannerMargin;
                banner.style.padding = originalBannerPadding;
                const logo = banner.querySelector('img');
                // Removed logo margin restore since we no longer alter it
            }

            // Restore sidebar
            sidebar.style.display = originalSidebarDisplay;
            
            // Restore visibility
            if (viewTitle) viewTitle.textContent = originalTitleBtn;
            viewOverview.style.height = '';
            viewOverview.style.overflow = '';

            const dayTimelineSectionRes = document.getElementById('day-timeline-section');
            const dayActivitiesSectionRes = document.getElementById('day-activities-section');
            if (dayTimelineSectionRes) dayTimelineSectionRes.style.display = '';
            if (dayActivitiesSectionRes) dayActivitiesSectionRes.style.display = '';

            viewPanels.forEach(panel => {
                if (panel.id === 'view-' + activeViewId) {
                    panel.classList.add('active');
                    panel.style.display = 'block';
                } else {
                    panel.classList.remove('active');
                    panel.style.display = 'none';
                }
                panel.style.marginBottom = '';
                panel.style.marginTop = '';
                panel.style.pageBreakBefore = '';
            });

            if (activeViewId !== 'overview' && banner) {
                banner.style.display = 'none';
            }

            downloadPdfBtn.style.display = 'flex';
            document.querySelector('.upload-dropdown').style.display = 'block';
            if (refreshBtn) refreshBtn.style.display = 'flex';

            // Chart.js completely blanks out canvas elements when their parent container 
            // is artificially flipped between 'display: none' and 'display: block' 
            // during the PDF generation screenshot process. 
            // This safely forces a clean redraw of the exact active view right after completion!
            setTimeout(() => {
                updateDashboard();
            }, 50);
        }
    });
}
