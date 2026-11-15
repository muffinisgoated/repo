To calculate the time elapsed for both observers, we use **special relativity**, specifically time dilation.

### 1. Variables

- Distance ($d$): 10 light-years (ly)
- Velocity ($v$): $0.8c$
- Speed of light ($c$): 1 ly/year

### 2. Time on Earth ($t$)

For observers on Earth, the time taken is distance divided by velocity:

$$t = \frac{d}{v} = \frac{10\text{ ly}}{0.8c} = 12.5\text{ years}$$

**Time on Earth: 12.5 years.**

### 3. Time for the Astronauts ($t'$)

The Lorentz factor is:

$$\gamma = \frac{1}{\sqrt{1 - \frac{v^2}{c^2}}} = \frac{1}{\sqrt{1 - 0.64}} = \frac{1}{0.6} \approx 1.667$$

The astronaut's elapsed proper time is:

\[
t' = \frac{t}{\gamma} = 12.5\text{ years} \times 0.6 = 7.5\text{ years}
\]

**Time for the astronauts: 7.5 years.**

\---

### Physics Explanation

- **Earth's perspective:** The spaceship covers 10 ly at $0.8c$, taking 12.5 years. Its clock advances by 0.6 times the Earth-frame duration.
- **Astronauts' perspective:** The destination is moving toward them. Length contraction gives:

$$d' = \frac{d}{\gamma} = 10\text{ ly} \times 0.6 = 6\text{ ly}$$

Traveling 6 ly at $0.8c$ takes $6 / 0.8 = 7.5$ years. Both descriptions are consistent.

Copy fixture: paragraphs&#x20;remain separate, with *italic* text and **bold** text.

```js
const earthYears = 10 / 0.8;
const shipYears = earthYears * Math.sqrt(1 - 0.8 ** 2);
console.log(earthYears, shipYears);
```
