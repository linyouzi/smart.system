export function renderCarLayout(trainNo) {
  const carCount = 8 + (parseInt(trainNo, 10) % 4);
  const highlightIdx = parseInt(trainNo, 10) % carCount;
  let html = '<div class="cars">';
  for (let i = 0; i < carCount; i++) {
    const isHighlight = i === highlightIdx;
    html += `<div class="car ${isHighlight ? "highlight" : ""}">${i + 1}${
      isHighlight ? '<div class="door"></div>' : ""
    }</div>`;
  }
  html += "</div>";
  return html;
}
