import { simulateCosts } from "../services/simulation-service.js";

export const simulationController = {
  simulate(req, res) {
    res.json(simulateCosts(req.body || {}));
  },
};
