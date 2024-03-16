type TimingEntries = {
  [key: string]: number[];
};

const MAX_SAMPLES = 50;

export const getFrameTimeTracker = () => {
  let timings: TimingEntries = {};

  const addSample = (name: string, time: number) => {
    if (!timings[name]) {
      timings[name] = [];
    }
    if (timings[name].push(time) > MAX_SAMPLES) {
      timings[name].shift();
    }
  };

  const clearEntry = (name: string) => {
    if (timings[name]) {
      timings[name] = [0];
    }
  };

  const getAverage = (name: string) => {
    const samples = timings[name];
    if (!samples) {
      return 0;
    }
    return samples.reduce((a, b) => a + b) / samples.length;
  };

  const toString = () => {
    return Object.keys(timings)
      .map((key) => {
        const average = getAverage(key);
        return `${key}: ${average.toFixed(2)}ms`;
      })
      .join("\n");
  };

  const toHTML = () => {
    return Object.keys(timings)
      .map((key) => {
        const average = getAverage(key);
        return `<div class="debug-row">
                    <div>
                        ${key}
                    </div>
                   <div>${average.toFixed(2)}ms</div>
                </div>`;
      })
      .join("\n");
  };

  return {
    addSample,
    clearEntry,
    toString,
    toHTML,
  };
};
