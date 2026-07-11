# PLS

PLS is a retail business intelligence system centered on products, channel entities, audience profiles, explainable product-channel fit, and operating feedback.

## Language

**Product Master**:
A stable product business object such as SKU, SPU, style code, listing, or product variant used as the anchor for product profiles, sales facts, and new-product prediction.
_Avoid_: SKU table, product fixture

**Profile Tag**:
A controlled audience, style, price, occasion, intent, or channel tag used consistently across imported profiles, model outputs, and explanations.
_Avoid_: label, crowd word, arbitrary tag

**Platform Portrait**:
An external platform's audience profile shape preserved in its original dimensions and labels before any PLS taxonomy projection.
_Avoid_: profile tag, normalized taxonomy output

**Native Audience Segment Distribution**:
A platform-native population segmentation and its shares, preserved with the platform system identity before any PLS taxonomy projection or cross-platform comparison.
_Avoid_: profile tags, inferred demographic segments, behavior signals

**Taxonomy Bridge**:
A controlled projection from an external platform portrait label into an existing PLS Profile Tag, with confidence and explicit unmapped handling.
_Avoid_: taxonomy expansion, label rewrite

**Channel Entity**:
A sellable or audience-bearing channel object such as shop, account, live room, content account, city, trade area, or store.
_Avoid_: channel when the object is actually a shop or account

**Fact Table**:
A versioned and time-windowed observation imported from business systems, such as sales performance or audience profile distribution.
_Avoid_: master table, runtime result

**Product-Channel Sales Fact**:
A fact describing how one product performed in one channel entity during a time window.
_Avoid_: wide table row

**Derived Result**:
A result produced by PLS from source data, such as prediction, match result, recommendation, or review.
_Avoid_: source data, master data

**Three Audience Segment Estimate**:
A Semir-specific Derived Result that estimates the shares of 质感流行派、都市体面家 and 百搭优选客 from a supported Native Audience Segment Distribution under a versioned mapping matrix.
_Avoid_: source audience distribution, mutually exclusive user identity, profile tags

**Simulated Market**:
A controlled decision-testing environment where a proposed product, channel, distribution, or campaign strategy is exposed to Target User Agents and returns simulated feedback as a Derived Result.
_Avoid_: real market, live campaign, auto execution

**Target User Agent**:
A simulated consumer role generated from an approved audience profile, such as a brand's Three Audience Segment Estimate, and used only inside a Simulated Market run.
_Avoid_: real customer, user account, platform user

**Simulation Run**:
A versioned execution record for one strategy tested against one Simulated Market setup, including input snapshot, target agents, assumptions, feedback, and quality flags.
_Avoid_: campaign run, live experiment, AB test

**Simulated Feedback**:
A Derived Result summarizing predicted target-user reactions, objections, intent, risks, and strategy adjustment suggestions from a Simulation Run.
_Avoid_: real feedback, sales result, conversion fact
