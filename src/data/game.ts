// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Prototype names and fixed values of the game that the calculator relies on.

/** Game ticks per second. The dataset gives many durations and rates per tick. */
export const TICKS_PER_SECOND = 60

/** Fuel category of burner machines and fuels that name none. */
export const DEFAULT_FUEL_CATEGORY = "chemical"

/** The nuclear reactor, as item and entity. */
export const NUCLEAR_REACTOR = "nuclear-reactor"

/** The recipe of one nuclear reactor burning one fuel cell. */
export const NUCLEAR_REACTOR_CYCLE = "nuclear-reactor-cycle"

/** The fuel cell of the nuclear reactor. */
export const URANIUM_FUEL_CELL = "uranium-fuel-cell"

/** The boiler, as item and entity. */
export const BOILER = "boiler"

/** Water, which boilers heat into steam. */
export const WATER = "water"

/** Steam from boilers, which steam engines burn. */
export const STEAM = "steam"

/** The rocket part, as item and recipe. */
export const ROCKET_PART = "rocket-part"

/** Resource category of fluids that pumpjacks extract, such as crude oil. */
export const BASIC_FLUID_CATEGORY = "basic-fluid"

/** The pumpjack. The calculator shows no building for fluid resources. */
export const PUMPJACK = "pumpjack"

/** Surface property that scales the output of solar panels, in percent. */
export const SOLAR_POWER_PROPERTY = "solar-power"

/** The rocket silo, whose icon marks targets in orbit. */
export const ROCKET_SILO = "rocket-silo"

/** The pipe, whose icon marks fluid rows in the factory table. */
export const PIPE = "pipe"
