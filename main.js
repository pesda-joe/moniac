// stocks
const tanks = {
  m1: {name: "Active money", level: 100},
  treasury: {name: "Government treasury", level: 100},
  m2: {name: "Savings accounts", level: 10},
}

// joins
const joins = {
  y: {name: "Private incomes"},
  hh: {name: "Domestic spending"},
}

// === FLOWS ===
// from/to:   node ids for the tank or join
// outflow:   formula that takes params or cam to produce the size of the flow
// describe:  pure text description of the flor for the inspector
// Must have one of:
//   params:  values for scalars or flat flow rates
//   cam:     shape for non-linear response
//              type:    name of cam shape from cams library
//              input:   function returning x value (tank level) for the curve
//              params:  definitions for this curve
const flows = {
  income: {
    name: "Household income",
    from: "m1",
    to: "y",
    params: {rate: 1},
    outflow: ({tanks, params}) => params.rate * tanks.m1.level,
    describe: ({params}) => `Income is ${(params.rate * 100).toFixed(0)}% of M1 by definition.`,
  },
  taxes: {
    name: "Taxes",
    from: "y",
    to: "treasury",
    params: {rate: 0.3},
    outflow: ({flows, params}) => params.rate * flows.income.value,
    describe: ({params}) => `Taxes are ${(params.rate * 100).toFixed(0)}% of incomes.`,
  },
  savings: {
    name: "Private savings",
    from: "y",
    to: "m2",
    params: {},
    cam: {
      type: "sigmoid",
      input: (tanks) => tanks.m2.level,
      params: {max: 0.2, midpoint: 10, sharpness: -1},
    },
    outflow: ({flows, cam}) => (flows.income.value - flows.taxes.value) * cam.value,
    describe: ({}) => `Savings rate will decrease as savings increase.`,
  },
  consumption: {
    name: "Consumption",
    from: "y",
    to: "hh",
    params: {},
    outflow: ({flows}) => flows.income.value - flows.taxes.value - flows.savings.value,
    describe: ({}) => `Consumption spending is the income remaining after taxes and savings.`,
  },
  g: {
    name: "Government spending",
    from: "treasury",
    to: "hh",
    params: {level: 35},
    outflow: ({params}) => params.level,
    describe: ({params}) => `Government spending is £${params.level}.`
  },
  i: {
    name: "Investment",
    from: "m2",
    to: "hh",
    params: {rate: 0.5},
    outflow: ({tanks, params}) => params.rate * tanks.m2.level,
    describe: ({params}) => `Uhhhhh, spending ${(params.rate * 100).toFixed(0)}% of savings, idk`
  },
  domestic: {
    name: "Final domestic spending",
    from: "hh",
    to: "m1",
    params: {},
    outflow: ({flows}) => flows.consumption.value + flows.g.value + flows.i.value,
    describe: ({}) => `The final amount households get in income`,
  },
}

const cams = {
  constant: {
    name: "Constant",
    spec: {
      value: { default: 1, min: 0, max: 100 },
    },
    curve: (x, p) => p.value,
  },
  linear: {
    name: "Linear",
    spec: {
      slope:     { default: 0.01, min: -0.1, max: 0.1 },
      intercept: { default: 0,    min: -100, max: 100 },
    },
    curve: (x, p) => {
      const a = p.slope * x + p.intercept;
      const b = Math.max(Math.min(a, 1), 0);
      return b;
    },
  },
  sigmoid: {
    name: "Complex",
    spec: {
      max:       { default: 0.5, min: 0,    max: 1   },
      midpoint:  { default: 0,   min: -100, max: 100 },
      sharpness: { default: 1,   min: -5,   max: 5   },
    },
    curve: (x, p) => p.max / (1 + Math.exp(-p.sharpness * (x - p.midpoint))),
  },
}

// === SIMULATION TICK ===

function clampFlow(v, flow, dt) {
  if (v < 0) return 0;
  if (!tanks[flow.from]) return v;
  return Math.min(v, tanks[flow.from].level / dt);
}

function tick(dt) {
  // First, evaluate all cams
  // cam.value     = cam.curve()      = scalar for outflow
  // cam.lastInput = flow.cam.input() = float level in the tank
  for (const flow of Object.values(flows)) {
    if (flow.cam){
      const x = flow.cam.input(tanks);
      flow.cam.value = cams[flow.cam.type].curve(x, flow.cam.params);
      flow.cam.lastInput = x;
    }
  }
  
  // Next, evaluate flow rates
  // flow.value = flow.outflow()
  for (const flow of Object.values(flows)) {
    const rawFlow = flow.outflow({tanks, flows, joins, cam: flow.cam, params: flow.params});
    flow.value = clampFlow(rawFlow, flow, dt);
  }

  // Finally, update all the tanks
  for (const flow of Object.values(flows)) {
    if (tanks[flow.from]) tanks[flow.from].level -= flow.value * dt;
    if (tanks[flow.to])   tanks[flow.to].level   += flow.value * dt;
  }
}

