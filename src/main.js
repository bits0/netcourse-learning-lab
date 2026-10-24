const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion.matches ? 0 : ms));

const state = {
  view: "welcome",
  chapter: 1,
  prediction: null,
  simStage: 0,
  simPlaying: false,
  simComplete: false,
  lessonSlide: 0,
  lessonChecked: false,
  mission: { started: false, scanned: false, fixed: false, complete: false },
  assessment: { index: 0, score: 0, selected: null, submitted: false, answers: [] }
};
let simTimer = null;
let packetTimer = null;
let toastTimer = null;
let transitioning = false;

const themeColors = {
  green: { background: "#0F0F0F" },
  orange: { background: "#252420" },
  tokyo: { background: "#0B081C" }
};

function setTheme(theme) {
  if (!themeColors[theme]) return;
  document.body.dataset.theme = theme;
  $$('[data-theme-select]').forEach((select) => { select.value = theme; });
  $('meta[name="theme-color"]').content = themeColors[theme].background;
  if (state.view === "welcome") drawGatewayNetwork();
}

const chapters = {
  1: {
    title: "Why Networks Exist",
    description: "Before the cables, protocols, and packets, there was a simple problem: how do we share what we know?",
    sections: [
      ["A world without networks", "Start with the problem networks were built to solve.", "04 MIN"],
      ["Devices & addresses", "Give every sender and receiver an identity.", "06 MIN"],
      ["The path between", "Follow a message from one device to another.", "08 MIN"],
      ["Your first transmission", "Put the pieces together in a guided simulation.", "05 MIN"]
    ],
    outcomes: ["Explain why networks exist", "Identify senders, receivers, and paths", "Predict how a message travels"]
  },
  2: {
    title: "Wrapping the Message",
    description: "A message needs more than content. Discover how addressing and encapsulation prepare it for the journey.",
    sections: [
      ["Data in layers", "Break a complex transmission into manageable layers.", "05 MIN"],
      ["Headers & addresses", "Attach the directions every packet needs.", "07 MIN"],
      ["Encapsulation", "Wrap the message one protocol at a time.", "08 MIN"],
      ["Build a packet", "Assemble a transmission in the packet lab.", "06 MIN"]
    ],
    outcomes: ["Describe encapsulation", "Read basic packet headers", "Explain why addressing matters"]
  },
  3: {
    title: "Devices & Topologies",
    description: "Meet the devices that move data and the connection patterns that determine where it can go.",
    sections: [
      ["Meet the devices", "Compare hosts, switches, routers, and servers.", "06 MIN"],
      ["Stars, meshes & buses", "Read the shape of a network.", "07 MIN"],
      ["Choosing a path", "See how topology changes a message's journey.", "08 MIN"],
      ["Build a topology", "Design a small network in the guided lab.", "06 MIN"]
    ],
    outcomes: ["Identify common network devices", "Compare basic topologies", "Choose a simple network layout"]
  }
};

const questions = [
  {
    question: "Why do networks exist?",
    answers: ["To make every device identical", "To share information and resources", "To remove the need for addresses"],
    correct: 1,
    topic: "The purpose of networks",
    explanation: "Networks let devices share information, services, and resources."
  },
  {
    question: "Which three parts does every network conversation need?",
    answers: ["A sender, a receiver, and a path", "A password, a server, and a browser", "A router, a cable, and a database"],
    correct: 0,
    topic: "Senders, receivers, and paths",
    explanation: "A sender uses a communication path to reach a receiver."
  },
  {
    question: "Device A sends a message to Device B. What happens next?",
    answers: ["The message appears on B without using a path", "The message becomes part of Device A", "The message travels across a connection toward B"],
    correct: 2,
    topic: "How messages travel",
    explanation: "Messages travel across a wired or wireless connection toward the receiver."
  }
];

const viewLabels = {
  hub: "LEARNING HUB",
  map: "COURSE MAP",
  overview: "CHAPTER OVERVIEW",
  lesson: "LESSON EXPERIENCE",
  lab: "PRACTICAL MISSION",
  check: "CHAPTER CHECK",
  summary: "CHAPTER SUMMARY"
};
const viewProgress = { hub: 12, map: 28, overview: 40, lesson: 55, lab: 75, check: 88, summary: 100 };

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function pauseSimulation() {
  state.simPlaying = false;
  clearTimeout(simTimer);
  updateSimControls();
}

function activateView(name) {
  $$(".view").forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
    view.classList.remove("is-entering");
    if (active) requestAnimationFrame(() => view.classList.add("is-entering"));
  });
  $("#application-shell").hidden = name === "welcome";
  state.view = name;
  document.body.dataset.currentView = name;
  if (name !== "lesson") pauseSimulation();
  const progress = $("#global-progress");
  progress.hidden = name === "welcome" || name === "lesson" || name === "hub";
  $("#global-progress-bar").style.width = `${viewProgress[name] || 0}%`;
  if (name !== "welcome") $("#header-section").textContent = viewLabels[name];
  window.scrollTo({ top: 0, behavior: "instant" });
  const heading = $(`[data-view="${name}"] h1`);
  if (heading) setTimeout(() => heading.focus({ preventScroll: true }), 40);
}

async function showView(name) {
  if (transitioning) return;
  if (state.view === name) {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "instant" : "smooth" });
    return;
  }
  transitioning = true;
  const current = $(`.view[data-view="${state.view}"]`);
  current?.classList.add("is-leaving");
  await wait(220);
  current?.classList.remove("is-leaving");
  activateView(name);
  transitioning = false;
}

function updateOverview() {
  const chapter = chapters[state.chapter];
  $("#overview-code").textContent = `MODULE_0${state.chapter} // BRIEFING`;
  $("#overview-eyebrow").textContent = `CHAPTER 0${state.chapter} · MISSION BRIEFING`;
  $("#overview-title").textContent = chapter.title;
  $("#overview-description").textContent = chapter.description;
  $$(".section-row").forEach((row, index) => {
    const [title, description, time] = chapter.sections[index];
    row.children[0].textContent = `${state.chapter}.${index + 1}`;
    $("strong", row).textContent = title;
    $("p", row).textContent = description;
    row.children[2].textContent = time;
  });
  $$(".outcome-panel li").forEach((item, index) => { item.textContent = chapter.outcomes[index]; });
}

async function openCourseWithMorph() {
  if (transitioning || reduceMotion.matches) {
    showView("map");
    return;
  }
  const source = $("#hub-course-title");
  const rect = source.getBoundingClientRect();
  const style = getComputedStyle(source);
  const clone = source.cloneNode(true);
  clone.removeAttribute("id");
  clone.className = "morph-title";
  Object.assign(clone.style, {
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
    fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight
  });
  document.body.appendChild(clone);
  transitioning = true;
  const current = $(".view[data-view='hub']");
  current.classList.add("is-leaving");
  await wait(180);
  current.classList.remove("is-leaving");
  activateView("map");
  transitioning = false;
  const target = $("#map-title");
  const targetRect = target.getBoundingClientRect();
  target.style.opacity = "0";
  const scale = targetRect.height / rect.height;
  const animation = clone.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${targetRect.left - rect.left}px, ${targetRect.top - rect.top}px) scale(${scale})`, opacity: 1 }
  ], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
  animation.onfinish = () => {
    target.style.opacity = "1";
    clone.remove();
  };
}

function resetLesson() {
  pauseSimulation();
  clearTimeout(packetTimer);
  state.prediction = null;
  state.simStage = 0;
  state.simComplete = false;
  state.lessonSlide = 0;
  state.lessonChecked = false;
  $("#sim-feedback").textContent = "Make a prediction, then run the simulation.";
  $("#sim-feedback").className = "sim-feedback";
  $("#lesson-track").classList.remove("show-second");
  $$("[data-lesson-slide]").forEach((slide, index) => slide.setAttribute("aria-hidden", String(index !== 0)));
  $$("[data-prediction]").forEach((button) => button.classList.remove("selected"));
  $$("[data-action='lesson-check']").forEach((button) => button.classList.remove("selected", "correct", "incorrect"));
  $("#lesson-check-feedback").textContent = "Choose the best answer to complete this lesson.";
  $("#lesson-check-feedback").className = "check-feedback";
  $("#lesson-step-label").textContent = `SECTION ${state.chapter}.2 · LESSON 1 OF 2`;
  $("#lesson-progress-percent").textContent = "50%";
  $("#lesson-progress-bar").style.width = "50%";
  $("#lesson-next").textContent = "Next";
  updateSimulationStage();
}

function updateSimControls() {
  $("#sim-play").disabled = state.simPlaying || state.simStage >= 3;
  $("#sim-pause").disabled = !state.simPlaying;
}

function updateSimulationStage() {
  const captions = [
    "Press Play or Step to build the network.",
    "First, the sender and receiver appear.",
    "Next, a connection forms between the devices.",
    "The message is traveling across the connection.",
    "Device B received the message. The path worked."
  ];
  $("#network-stage").dataset.stage = state.simStage;
  $("#sim-caption").textContent = captions[state.simStage];
  $("#sim-state").textContent = ["READY", "DEVICES ONLINE", "LINK ESTABLISHED", "PACKET IN TRANSIT", "TRANSMISSION COMPLETE"][state.simStage];
  updateSimControls();
}

function completeSimulation() {
  state.simStage = 4;
  state.simComplete = true;
  state.simPlaying = false;
  updateSimulationStage();
  const feedback = $("#sim-feedback");
  if (!state.prediction) {
    feedback.textContent = "Simulation complete. Make your prediction to unlock Next.";
    feedback.className = "sim-feedback warning";
  } else if (state.prediction === "travels") {
    feedback.textContent = "Prediction confirmed. The message traveled along the path to Device B.";
    feedback.className = "sim-feedback success";
  } else {
    feedback.textContent = "Not quite. The message needed the connection and traveled along it to Device B.";
    feedback.className = "sim-feedback warning";
  }
  updateLessonNext();
}

function advanceSimulation() {
  if (state.simComplete || state.simStage >= 3) return;
  state.simStage += 1;
  updateSimulationStage();
  if (state.simStage === 3) {
    state.simPlaying = false;
    const motion = $("#packet-motion");
    try { motion.beginElement(); } catch { /* SVG animation fallback leaves the final state usable. */ }
    packetTimer = setTimeout(completeSimulation, reduceMotion.matches ? 0 : 1450);
    updateSimControls();
  }
}

function playSimulation() {
  if (state.simPlaying || state.simStage >= 3) return;
  state.simPlaying = true;
  updateSimControls();
  const run = () => {
    if (!state.simPlaying) return;
    advanceSimulation();
    if (state.simPlaying && state.simStage < 3) simTimer = setTimeout(run, reduceMotion.matches ? 0 : 950);
  };
  run();
}

function resetSimulation() {
  pauseSimulation();
  clearTimeout(packetTimer);
  state.simStage = 0;
  state.simComplete = false;
  const svg = $("#network-stage svg");
  try { svg.setCurrentTime(0); } catch { /* Not required for controls to work. */ }
  $("#sim-feedback").textContent = state.prediction ? "Prediction saved. Run the simulation again." : "Make a prediction, then run the simulation.";
  $("#sim-feedback").className = "sim-feedback";
  updateSimulationStage();
  updateLessonNext();
}

function updateLessonNext() {
  const next = $("#lesson-next");
  if (state.lessonSlide === 0) {
    const unlocked = state.simComplete && Boolean(state.prediction);
    next.disabled = !unlocked;
    $("#lesson-footer-hint").textContent = unlocked ? "Activity complete. You can continue." : "Complete the activity to continue.";
  } else {
    next.disabled = !state.lessonChecked;
    next.textContent = "Practical mission";
    $("#lesson-footer-hint").textContent = state.lessonChecked ? "Lesson complete. Your lab is ready." : "Answer the quick check to continue.";
  }
}

function showSecondLesson() {
  state.lessonSlide = 1;
  $("#lesson-track").classList.add("show-second");
  $$("[data-lesson-slide]").forEach((slide, index) => slide.setAttribute("aria-hidden", String(index !== 1)));
  $("#lesson-step-label").textContent = `SECTION ${state.chapter}.2 · LESSON 2 OF 2`;
  $("#lesson-progress-percent").textContent = "100%";
  $("#lesson-progress-bar").style.width = "100%";
  updateLessonNext();
  const heading = $("[data-lesson-slide='1'] h1");
  setTimeout(() => heading.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 280);
}

function startMission() {
  state.mission.started = true;
  const briefing = $("#mission-briefing");
  briefing.classList.add("is-leaving");
  setTimeout(() => {
    briefing.hidden = true;
    briefing.classList.remove("is-leaving");
    $("#lab-workspace").hidden = false;
    showToast("Mission started. Open the CLI to run a network scan.");
  }, reduceMotion.matches ? 0 : 200);
}

function toggleCLI() {
  const panel = $("#cli-panel");
  const opening = panel.hidden;
  panel.hidden = !opening;
  $("#lab-workspace").classList.toggle("cli-open", opening);
  $("#cli-toggle").innerHTML = opening ? "Close CLI<span>⌘</span>" : "Open CLI<span>⌘</span>";
  if (opening) setTimeout(() => $("#cli-input").focus(), 230);
  else $("#cli-toggle").focus();
}

function appendCLI(text, className = "") {
  const line = document.createElement("p");
  line.textContent = text;
  if (className) line.className = className;
  $("#cli-output").appendChild(line);
  $("#cli-output").scrollTop = $("#cli-output").scrollHeight;
}

function completeObjective(id) {
  const row = $(`#${id}`);
  row.classList.add("done");
  $("strong", row).textContent = "DONE";
}

function runCommand(rawCommand) {
  const command = rawCommand.trim().toLowerCase();
  if (!command) return;
  appendCLI(`netlab:~$ ${command}`);
  if (command === "clear") {
    $("#cli-output").innerHTML = "";
    return;
  }
  if (command === "help") {
    appendCLI("Commands: scan · fix link · ping · clear");
    return;
  }
  if (command === "scan") {
    state.mission.scanned = true;
    completeObjective("objective-scan");
    appendCLI("Scanning 3 nodes and 2 links...");
    appendCLI("FAULT: Switch 01 → Server B link is DOWN.", "error");
    appendCLI("Suggested action: fix link");
    return;
  }
  if (command === "fix link" || command === "fix") {
    if (!state.mission.scanned) {
      appendCLI("No diagnosis found. Run scan first.", "error");
      return;
    }
    if (state.mission.fixed) {
      appendCLI("Link is already repaired. Run ping to verify.");
      return;
    }
    state.mission.fixed = true;
    completeObjective("objective-fix");
    $("#lab-network").classList.add("repaired");
    $("#network-health").textContent = "LINK RESTORED";
    appendCLI("Re-establishing Switch 01 → Server B...");
    appendCLI("Link is UP. Verify connectivity with ping.", "success");
    return;
  }
  if (command === "ping" || command === "ping 192.168.1.20") {
    if (!state.mission.fixed) {
      appendCLI("PING 192.168.1.20: 100% packet loss.", "error");
      appendCLI("Diagnose and repair the path before retrying.");
      return;
    }
    completeObjective("objective-ping");
    state.mission.complete = true;
    $("#network-health").textContent = "NETWORK HEALTHY";
    $("#network-health").classList.add("healthy");
    appendCLI("PING 192.168.1.20: 4 packets sent, 4 received.", "success");
    appendCLI("MISSION COMPLETE: Communication restored.", "success");
    $("#lab-completion").hidden = false;
    showToast("Mission complete. Chapter check unlocked.");
    return;
  }
  appendCLI(`Unknown command: ${command}. Type help.`, "error");
}

function resetAssessment() {
  state.assessment = { index: 0, score: 0, selected: null, submitted: false, answers: [] };
  renderQuestion();
}

function renderQuestion() {
  const assessment = state.assessment;
  const question = questions[assessment.index];
  assessment.selected = null;
  assessment.submitted = false;
  $("#check-question").textContent = question.question;
  $("#question-counter").textContent = `QUESTION ${assessment.index + 1} OF ${questions.length}`;
  const percent = Math.round(((assessment.index + 1) / questions.length) * 100);
  $("#assessment-percent").textContent = `${percent}%`;
  $("#assessment-progress-bar").style.width = `${percent}%`;
  const list = $("#answer-list");
  list.innerHTML = "";
  question.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    button.dataset.action = "select-answer";
    button.dataset.index = index;
    button.dataset.letter = String.fromCharCode(65 + index);
    button.textContent = answer;
    list.appendChild(button);
  });
  $("#answer-feedback").textContent = "";
  $("#answer-feedback").className = "answer-feedback";
  $("#submit-answer").disabled = true;
  $("#submit-answer").hidden = false;
  $("#next-question").disabled = true;
  $("#next-question").textContent = assessment.index === questions.length - 1 ? "View results" : "Next question";
  const card = $("#question-card");
  card.classList.remove("question-swap");
  requestAnimationFrame(() => card.classList.add("question-swap"));
}

function selectAnswer(index) {
  if (state.assessment.submitted) return;
  state.assessment.selected = index;
  $$(".answer-option").forEach((button, buttonIndex) => button.classList.toggle("selected", buttonIndex === index));
  $("#submit-answer").disabled = false;
  $("#answer-feedback").textContent = "Answer selected. Submit when you are ready.";
}

function submitAnswer() {
  const assessment = state.assessment;
  if (assessment.selected === null || assessment.submitted) return;
  assessment.submitted = true;
  const question = questions[assessment.index];
  const correct = assessment.selected === question.correct;
  if (correct) assessment.score += 1;
  assessment.answers.push({ question: assessment.index, correct, topic: question.topic });
  $$(".answer-option").forEach((button, index) => {
    button.disabled = true;
    if (index === question.correct) button.classList.add("correct");
    if (index === assessment.selected && !correct) button.classList.add("incorrect");
  });
  const feedback = $("#answer-feedback");
  feedback.textContent = `${correct ? "Correct. " : "Not quite. "}${question.explanation}`;
  feedback.className = `answer-feedback ${correct ? "success" : "warning"}`;
  $("#submit-answer").hidden = true;
  $("#next-question").disabled = false;
  $("#next-question").focus();
}

function renderSummary() {
  const { score, answers } = state.assessment;
  const passed = score >= 2 && state.mission.complete;
  const percent = Math.round((score / questions.length) * 100);
  $("#assessment-result").textContent = `${score}/${questions.length}`;
  $("#assessment-result-label").textContent = score === 3 ? "EXCELLENT" : score >= 2 ? "PASSED" : "REVIEW";
  $("#assessment-result-bar").style.width = `${percent}%`;
  $("#assessment-result-copy").textContent = score === 3 ? "All three concepts are connected." : score >= 2 ? "You have a working model of network communication." : "A short review will help reconnect the concepts.";
  $("#mission-result").textContent = state.mission.complete ? "COMPLETE" : "INCOMPLETE";
  $("#achievement").classList.toggle("complete", passed);
  $("#summary-eyebrow").textContent = passed ? "CHAPTER COMPLETE" : "PROGRESS SAVED";
  $("#summary-title").textContent = passed ? "Connection established." : "One more connection.";
  $("#summary-description").textContent = passed ? "You can now explain how a message moves from one device to another." : "Review the highlighted ideas, then try the chapter check again.";
  $("#continue-chapter-2").hidden = !passed;
  $("#retake-check").hidden = passed;
  const review = $("#review-panel");
  review.hidden = passed;
  if (!passed) {
    const topics = [...new Set(answers.filter((answer) => !answer.correct).map((answer) => answer.topic))];
    $("#review-topics").innerHTML = `<ul>${topics.map((topic) => `<li>${topic}</li>`).join("")}</ul>`;
  }
  if (passed) {
    const status1 = $("#chapter-1-status");
    status1.textContent = "COMPLETED";
    status1.className = "status-badge completed";
    const status2 = $("#chapter-2-status");
    status2.textContent = "IN PROGRESS";
    status2.className = "status-badge in-progress";
  }
}

const translations = {
  en: {
    welcomeKicker: "KNOWLEDGE TRAVELS HERE",
    welcomeTitle: "Learn the network.<br><span>Become the signal.</span>",
    welcomeDescription: "A hands-on learning experience where every concept connects, every packet has a path, and every mission makes the network clearer.",
    start: "Start learning", explore: "Explore courses", hubTitle: "What should you<br><span>learn next?</span>"
  },
  fr: {
    welcomeKicker: "LE SAVOIR CIRCULE ICI",
    welcomeTitle: "Apprenez le réseau.<br><span>Devenez le signal.</span>",
    welcomeDescription: "Une expérience pratique où chaque concept se connecte, chaque paquet suit son chemin et chaque mission clarifie le réseau.",
    start: "Commencer", explore: "Explorer les cours", hubTitle: "Que devriez-vous<br><span>apprendre ensuite ?</span>"
  }
};

function setLanguage(language) {
  document.documentElement.lang = language;
  $$('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (translations[language][key]) element.innerHTML = translations[language][key];
  });
  showToast(language === "fr" ? "Interface définie en français." : "Interface set to English.");
}

async function handleAction(action, element) {
  switch (action) {
    case "start-learning": await showView("hub"); break;
    case "explore-courses":
      await showView("hub");
      setTimeout(() => $(".course-library").scrollIntoView({ behavior: reduceMotion.matches ? "instant" : "smooth", block: "center" }), 100);
      break;
    case "go-welcome": await showView("welcome"); break;
    case "go-hub": await showView("hub"); break;
    case "go-map": await showView("map"); break;
    case "open-course": await openCourseWithMorph(); break;
    case "open-chapter":
      state.chapter = Number(element.dataset.chapter);
      updateOverview();
      await showView("overview");
      break;
    case "begin-chapter": resetLesson(); await showView("lesson"); break;
    case "leave-lesson": await showView("overview"); break;
    case "predict":
      state.prediction = element.dataset.prediction;
      $$("[data-prediction]").forEach((button) => button.classList.toggle("selected", button === element));
      if (state.simComplete) completeSimulation();
      else {
        $("#sim-feedback").textContent = "Prediction saved. Run the simulation to test it.";
        $("#sim-feedback").className = "sim-feedback";
      }
      updateLessonNext();
      break;
    case "sim-play": playSimulation(); break;
    case "sim-pause": pauseSimulation(); $("#sim-state").textContent = "PAUSED"; break;
    case "sim-step": pauseSimulation(); advanceSimulation(); break;
    case "sim-reset": resetSimulation(); break;
    case "lesson-next":
      if (state.lessonSlide === 0) showSecondLesson();
      else if (state.lessonChecked) await showView("lab");
      break;
    case "lesson-check": {
      const correct = element.dataset.correct === "true";
      $$("[data-action='lesson-check']").forEach((button) => button.classList.remove("selected", "correct", "incorrect"));
      element.classList.add("selected", correct ? "correct" : "incorrect");
      state.lessonChecked = correct;
      const feedback = $("#lesson-check-feedback");
      feedback.textContent = correct ? "Correct. Sender, path, and receiver form the communication model." : "Try again. Think about who sends, who receives, and how the message gets there.";
      feedback.className = `check-feedback ${correct ? "success" : "warning"}`;
      updateLessonNext();
      break;
    }
    case "back-to-lesson": await showView("lesson"); break;
    case "start-mission": startMission(); break;
    case "inspect-device": {
      $$("[data-device]").forEach((button) => button.classList.toggle("selected", button === element));
      const device = element.dataset.device;
      const descriptions = {
        "Device A": "Online · Sender ready · 192.168.1.10",
        "Switch 01": "Online · One downstream link needs inspection",
        "Server B": "Online · Waiting for a valid network path"
      };
      $("#device-inspector").innerHTML = `<span>INSPECTOR</span><strong>${device}</strong><p>${descriptions[device]}</p>`;
      break;
    }
    case "toggle-cli": toggleCLI(); break;
    case "run-command": runCommand(element.dataset.command); break;
    case "start-check": resetAssessment(); await showView("check"); break;
    case "exit-check": await showView("lab"); break;
    case "select-answer": selectAnswer(Number(element.dataset.index)); break;
    case "submit-answer": submitAnswer(); break;
    case "next-question":
      if (!state.assessment.submitted) return;
      if (state.assessment.index === questions.length - 1) {
        renderSummary();
        await showView("summary");
      } else {
        state.assessment.index += 1;
        renderQuestion();
        $("#check-question").focus();
      }
      break;
    case "continue-chapter-2": state.chapter = 2; updateOverview(); await showView("overview"); break;
    case "retake-check": resetAssessment(); await showView("check"); break;
  }
}

document.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control || control.disabled) return;
  handleAction(control.dataset.action, control);
});

$$("[data-theme-select]").forEach((select) => select.addEventListener("change", (event) => setTheme(event.target.value)));
$("#language-select").addEventListener("change", (event) => setLanguage(event.target.value));
$("#cli-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#cli-input");
  runCommand(input.value);
  input.value = "";
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.view === "lab" && !$("#cli-panel").hidden) toggleCLI();
});

// Terminal boot sequence
const bootMessages = [
  "[ OK ] Initializing NETCOURSE kernel",
  "[ OK ] Mounting learning protocols",
  "[ OK ] Connecting interactive lab nodes",
  "[INFO] Loading Network Basics pathway",
  "[ OK ] Gateway ready. Welcome, learner."
];
bootMessages.forEach((message, index) => {
  setTimeout(() => {
    const line = document.createElement("span");
    line.className = "boot-line";
    const type = message.includes("[ OK ]") ? "ok" : "info";
    line.innerHTML = message.replace(/\[ OK \]|\[INFO\]/, (match) => `<i class="${type}">${match}</i>`);
    $("#boot-lines").appendChild(line);
  }, reduceMotion.matches ? 0 : 350 + index * 520);
});

// Decorative gateway network with moving packets
const canvas = $("#network-canvas");
const context = canvas.getContext("2d");
let nodes = [];
let edges = [];
let packets = [];
let canvasWidth = 0;
let canvasHeight = 0;

function buildGatewayNetwork() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = Math.max(18, Math.min(34, Math.round(rect.width / 48)));
  nodes = Array.from({ length: count }, (_, index) => ({
    x: ((index * 83) % 97) / 97 * rect.width + (Math.random() - .5) * 70,
    y: ((index * 47) % 89) / 89 * rect.height + (Math.random() - .5) * 70,
    radius: index % 7 === 0 ? 3 : 1.6
  }));
  edges = [];
  nodes.forEach((node, index) => {
    nodes.slice(index + 1).forEach((other, otherIndex) => {
      const distance = Math.hypot(node.x - other.x, node.y - other.y);
      if (distance < Math.min(220, rect.width / 4)) edges.push([index, index + 1 + otherIndex]);
    });
  });
  packets = Array.from({ length: 10 }, (_, index) => ({ edge: index % Math.max(edges.length, 1), progress: (index * .13) % 1, speed: .0015 + (index % 4) * .00045 }));
}

function drawGatewayNetwork() {
  const styles = getComputedStyle(document.body);
  const rgb = (name) => styles.getPropertyValue(name).trim();
  const palette = {
    edge: `rgba(${rgb("--network-rgb")},.16)`,
    node: `rgba(${rgb("--network-rgb")},.62)`,
    hub: `rgba(${rgb("--packet-rgb")},.78)`,
    packet: `rgba(${rgb("--text-rgb")},.92)`,
    glow: styles.getPropertyValue("--accent-primary").trim()
  };
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.lineWidth = 1;
  edges.forEach(([from, to]) => {
    context.beginPath();
    context.moveTo(nodes[from].x, nodes[from].y);
    context.lineTo(nodes[to].x, nodes[to].y);
    context.strokeStyle = palette.edge;
    context.stroke();
  });
  nodes.forEach((node) => {
    context.beginPath();
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    context.fillStyle = node.radius > 2 ? palette.hub : palette.node;
    context.fill();
  });
  packets.forEach((packet) => {
    const edge = edges[packet.edge];
    if (!edge) return;
    const from = nodes[edge[0]];
    const to = nodes[edge[1]];
    const x = from.x + (to.x - from.x) * packet.progress;
    const y = from.y + (to.y - from.y) * packet.progress;
    context.beginPath();
    context.arc(x, y, 2.2, 0, Math.PI * 2);
    context.fillStyle = palette.packet;
    context.shadowColor = palette.glow;
    context.shadowBlur = 10;
    context.fill();
    context.shadowBlur = 0;
    if (!reduceMotion.matches && state.view === "welcome") {
      packet.progress += packet.speed;
      if (packet.progress > 1) {
        packet.progress = 0;
        packet.edge = Math.floor(Math.random() * edges.length);
      }
    }
  });
}

function animateGateway() {
  if (state.view === "welcome") drawGatewayNetwork();
  requestAnimationFrame(animateGateway);
}
window.addEventListener("resize", buildGatewayNetwork);
buildGatewayNetwork();
animateGateway();
