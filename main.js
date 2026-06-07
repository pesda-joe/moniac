// stocks
const tanks = {
  m1: {name: "Active money",     level: 100},
  m2: {name: "Inactive money",   level: 100,
    signal: {
      name: "Interest rate", symbol: "i",
      cam: {
        type: "sigmoid",
        params: {min: 0.005, max: 0.15, midpoint: 100, sharpness: -0.05},
      },
    },
  },
  m3: {name: "Foreign reserves", level: 50,
    signal: {
      name: "Exchange rate", symbol: "e",
      cam: {
        type: "exponential",
        params: {base: 1, rate: -0.01},
      },
    },
  },
}

// joins
const joins = {
  y:  {name: "Private incomes"},
  hh: {name: "Domestic spending"},
  r:  {name: "Final income"},
}

// controls
const controls = {
  m2peg: {target: 100, open: false, rate: 5},
  m3peg: {target: 50,  open: false, rate: 5}
}

// === FLOWS ====================================================================
// from/to:   node ids for the tank or join
// outflow:   formula that takes params or cam to produce the size of the flow
// describe:  pure text description of the flor for the inspector
// Must have one of:
//   params:  values for scalars or flat flow rates
//   cam:     shape for non-linear response
//              type:    name of cam shape from camsLibrary
//              input:   function returning x value (tank level) for the curve
//              params:  definitions for this curve
const flows = {
  income: {
    name: "Household income",
    from: "m1",
    to: "y",
    outflow: ({tanks}) => tanks.m1.level,
    describe: () => `Income is 100% of M1 by definition.`,
  },
  taxes: {
    name: "Taxes",
    from: "y",
    to: "m2",
    valve: {
      mode: "fraction",
      rate: 30,
      fraction: 0.3,
      cams: { main: {
        type: "sigmoid", 
        input: ({tanks}) => tanks.m1.level,
        params: {max: 0.4, min: 0.3, midpoint: 100, sharpness: 1},
      }},
    },
    outflow: ({flows, valve}) => computeValve(valve, flows.income.value),
    //describe: ({valve}) => `Taxes are ${(params.rate * 100).toFixed(0)}% of incomes.`,
  },
  savings: {
    name: "Private savings",
    from: "y",
    to: "m2",
    valve: {
      mode: "cam",
      rate: 10,
      fraction: 0.1,
      cams: { 
        propensityToSave: {
          type:  "linear",
          input:  ({tanks}) => tanks.m1.level,
          params: {slope: -0.01, intercept: 0.05},
        },
        interestEffect: {
          type:   "sigmoid",
          input:  ({tanks}) => tanks.m2.signal.value,
          params: {min: 0.05, max: 0.3, midpoint: 0.06, sharpness: -0.5},
        },
      }, 
    },
    outflow: ({flows, valve}) => computeValve(valve, flows.income.value - flows.taxes.value),
    //describe: ({}) => `Savings rate will decrease as savings increase.`,
  },
  consumption: {
    name: "Consumption",
    from: "y",
    to: "hh",
    outflow: ({flows}) => flows.income.value - flows.taxes.value - flows.savings.value,
    //describe: ({}) => `Consumption spending is the income remaining after taxes and savings.`,
  },
  g: {
    name: "Government spending",
    from: "m2",
    to: "hh",
    valve: {
      mode: "rate",
      rate: 35,
      fraction: 0.2,
      cams: { main: {
        type: "sigmoid",
        input: ({tanks}) => tanks.m1.level,
        params: {min: 0.1, max: 0.6, midpoint: 100, sharpness: 0.2},
      }},
    },
    outflow: ({tanks, valve}) => computeValve(valve, tanks.m2.level),
    //describe: ({params}) => `Government spending is £${params.level}.`
  },
  i: {
    name: "Investment",
    from: "m2",
    to: "hh",
    valve: {
      mode: "cam",
      rate: 20,
      fraction: 0.15,
      cams: {
        propensityToInvest: {
          type: "sigmoid",
          input: ({tanks}) => tanks.m1.level,
          params: {min: 0.05, max: 0.4, midpoint: 100, sharpness: 0.1},
        },
        investmentEfficiency: {
          type: "sigmoid",
          input: ({tanks}) => tanks.m2.signal.value,
          params: {min: 0, max: 0.1, midpoint: 0.06, sharpness: 0.1},
        },
      },
    },
    outflow: ({tanks, valve}) => computeValve(valve, tanks.m2.level)
    //describe: ({params}) => `Uhhhhh, spending ${(params.rate * 100).toFixed(0)}% of savings, idk`
  },
  imports: {
    name: "Imports",
    from: "hh",
    to: "m3",
    valve: {
      mode: "cam",
      rate: 10,
      fraction: 0.1,
      cams: {
        propensityToImport: {
          type: "sigmoid",
          input: ({tanks}) => tanks.m1.level,
          params: {min: 0.02, max: 0.2, midpoint: 100, sharpness: 0.2},
        },
        exchangeElasticityExpenditure: {
          type: "sigmoid",
          input: ({tanks}) => tanks.m3.signal.value,
          params: {min:  0.03, max: 0.1, midpoint: 0.5, sharpness: -0.2},
        },
      },
    },
    outflow: ({valve, flows}) => computeValve(valve, flows.consumption.value + flows.g.value + flows.i.value),
    //describe: ({}) => `The final amount households get in income`,
  },
  dx: {
    name: "Non-traded spending",
    from: "hh",
    to: "r",
    outflow: ({flows}) => flows.consumption.value + flows.g.value + flows.i.value - flows.imports.value,
  },
  exports: {
    name: "Exports",
    from: "m3",
    to: "r",
    valve: {
      mode: "cam",
      rate: 10,
      fraction: 0.1,
      cams: {
        propensityToExport: {
          type: "sigmoid",
          input: ({tanks}) => tanks.m1.level,
          params: {min: 0.02, max: 0.2, midpoint: 100, sharpness: 0.2},
        },
        exchangeElasticityExpenditure: {
          type: "sigmoid",
          input: ({tanks}) => tanks.m3.signal.value,
          params: {min:  0.03, max: 0.1, midpoint: 0.5, sharpness: 0.2},
        },
      },
    },
    outflow: ({valve, tanks}) => computeValve(valve, tanks.m3.level),
  },
  final: {
    name: "Gross domestic spending",
    from: "r",
    to: "m1",
    outflow: ({flows}) => flows.dx.value + flows.exports.value,
  },

  m2PegInject: {
    name: "Open-market injection",
    // no from:
    to: "m2",
    outflow: ({tanks, controls}) => {
      const p = controls.m2peg;
      if (!p.open) return 0;
      return Math.max(0, (p.target - tanks.m2.level) * p.rate)
    },
  },

  m2PegDrain: {
    name: "Open-market drain",
    from: "m2",
    // no to:
    outflow: ({tanks, controls}) => {
      const p = controls.m2peg;
      if (!p.open) return 0;
      return Math.max(0, (tanks.m2.level - p.target) * p.rate);
    },
  },

  m3PegInject: {
    name: "Exchange control injection",
    // no from:
    to: "m3",
    outflow: ({tanks, controls}) => {
      const p = controls.m3peg;
      if (!p.open) return 0;
      return Math.max(0, (p.target - tanks.m3.level) * p.rate)
    },
  },

  m3PegDrain: {
    name: "Exchange control drain",
    from: "m3",
    // no to:
    outflow: ({tanks, controls}) => {
      const p = controls.m3peg;
      if (!p.open) return 0;
      return Math.max(0, (tanks.m3.level - p.target) * p.rate);
    },
  },
}

// === CAMS ======================================================================
const camsLibrary = {
  constant: {
    name: "Constant",
    spec: {
      value: { default: 0.01, min: 0, max: 1 },
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
  exponential: {
    name: "Exponential",
    spec: {
      base: {default: 1, min: 0.01, max: 10},
      rate: {default: 0.01, min: -1, max: 1},
    },
    curve: (x, p) => p.base * Math.exp(p.rate * x),
  },
  sigmoid: {
    name: "Complex",
    spec: {
      min:       { default: 0,   min: 0,    max: 1   },
      max:       { default: 0.5, min: 0,    max: 1   },
      midpoint:  { default: 0,   min: -200, max: 200 },
      sharpness: { default: 1,   min: -0.5, max: 0.5   },
    },
    curve: (x, p) => p.min + (p.max - p.min) / (1 + Math.exp(-p.sharpness * (x - p.midpoint))),
  },
}

// === SIMULATION TICK =====================================================================

function clampFlow(v, flow, dt) {
  if (v < 0) return 0;
  if (!tanks[flow.from]) return v;
  return Math.min(v, tanks[flow.from].level / dt);
}

function computeValve(valve, inflow){
  switch (valve.mode) {
    case "rate": return Math.min(valve.rate, inflow);
    case "fraction": return valve.fraction * inflow;
    case "cam": {
      const camArr = Object.values(valve.cams);
      const mean = camArr.reduce((sum, c) => sum + c.value, 0) / camArr.length;
      return mean * inflow;
    }
  }
}

function tick(dt) {
  //First, evaluate signal floats
  for (const tank of Object.values(tanks)) {
    if (!tank.signal) continue;
    tank.signal.value = camsLibrary[tank.signal.cam.type].curve(tank.level, tank.signal.cam.params);
  }

  // Then, evaluate all cams
  // cam.value     = cam.curve()      = scalar for outflow
  // cam.lastInput = flow.cam.input() = float level in the tank
  for (const flow of Object.values(flows)) {
    if (flow.valve?.mode !== "cam") continue;
    for (const cam of Object.values(flow.valve.cams)) {
      const x = cam.input({tanks, flows, joins});
      cam.lastInput = x;
      cam.value = camsLibrary[cam.type].curve(x, cam.params);
    }
  }
  
  // Next, evaluate flow rates
  // flow.value = flow.outflow()
  for (const flow of Object.values(flows)) {
    const rawFlow = flow.outflow({tanks, flows, joins, controls, valve: flow.valve});
    flow.value = clampFlow(rawFlow, flow, dt);
  }

  // Finally, update all the tanks
  for (const flow of Object.values(flows)) {
    if (tanks[flow.from]) tanks[flow.from].level -= flow.value * dt;
    if (tanks[flow.to])   tanks[flow.to].level   += flow.value * dt;
  }
}

