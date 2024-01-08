type TimingEntries = {
  [key: string]: number[];
};

const MAX_SAMPLES = 100;

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

  return {
    addSample,
    toString,
  };
};
