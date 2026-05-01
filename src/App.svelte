<script lang="ts">
  import WikiSearch from "./lib/WikiSearch.svelte";

  import { bus, createRenderer } from "./core-anvaka-vs";
  import { appState, performSearch } from "./lib/state";
  import { apiClient, isMobile } from "./lib/apiClient";
  import About from "./lib/About.svelte";

  import { Confetti } from "svelte-confetti";
  import AboutWordle from "./lib/AboutWordle.svelte";
  let showConfetti = false
  let showConfettiContainer = false

  let aboutVisible = false;
  let aboutWordleVisible = false;

  let hoverDelayTimer: ReturnType<typeof setTimeout>;

  // console.log('[App] appState:', appState)

  // ------------------------------------------ language
  /**
   * can't do this in useState
   * (core-anvaka-vs module doesn't know about apiClient.setLang method)
   *
   * so setting a language here.
   *
   * Use case:
   *  1. first load
   *  2. collect appState from url
   *  3. perform search if query isn't empty (to this moment `lang` should be properly set)
   */

  const DEFAULT_LANG = "en";
  apiClient.setLang(appState.lang || DEFAULT_LANG);

  let currentSearchQuery = appState.query || "";

  let settingsRebuildTimer: ReturnType<typeof setTimeout>;

  function scheduleGraphRebuild() {
    const query = currentSearchQuery.trim();

    if (!query) {
      return;
    }

    clearTimeout(settingsRebuildTimer);
    settingsRebuildTimer = setTimeout(async () => {
      appState.query = query;
      summaryCache.clear();
      await performSearchWrap(query);
      renderer.render(appState.graph);
    }, 300);
  }

  function updateNumberSetting(key: "linkLimit" | "maxDepth", event: Event, min: number, max: number) {
    const input = event.currentTarget as HTMLInputElement;
    const value = Math.min(max, Math.max(min, Math.floor(Number(input.value) || min)));

    input.value = String(value);
    appState[key] = value;
    scheduleGraphRebuild();
  }
  // ---------------------------------------------------

  function wordlePlaceholder(node) {
    // return '...'
    return node.id.replaceAll(/[^\n\s]/g,  '-')

  }

  function isWordleOn() {
    return appState.wordle.toString().includes('true')
  }

  /**
   * this funciton garantees that hidden
   * nodes don't flash on first render
   **/
  function getText(node) {
    console.log("🚀 | getText | node", node)

    const ids = getWordleIdsSet()

    if (isWordleOn() && ids.has(node?.data?.pageid?.toString())) {
      return wordlePlaceholder(node)
    }

    return node.id
  }

  function wordleAddNodeHook(node, ui, text) {
    // if (!isWordleOn()) return

    const ids = getWordleIdsSet()

    if(ids.has(node?.data?.pageid?.toString())) {
      wordleNodes.set(node.data.pageid, {node, ui, text})
    }
  }

  const renderer = createRenderer(appState.progress, isMobile, getText, wordleAddNodeHook);

  if (appState.query) {
    performSearchWrap(appState.query).then((res) => {
      if (appState.graph) {
        renderer.render(appState.graph);
      }
    });
  }

  function dropWordleIds() {
    wordleNodes.forEach(obj => {
      obj.text.text(obj.node.id)
    })
    wordleNodes.clear()
    appState.wordle = true
  }

  function toggleWordleMode() {
    const ids = getWordleIdsSet()

    if (ids.has('true')) {
      ids.delete('true')
      ids.add('false')

      wordleNodes.forEach(obj => {
        obj.text.text(obj.node.id)
      })
    } else {
      ids.delete('false')
      ids.add('true')

      wordleNodes.forEach(obj => {
        obj.text.text(wordlePlaceholder(obj.node))
      })
    }
    appState.wordle = [...ids].join(wordleIdSep)
  }

  // ------------------------------------------ tooltip
  let isTooltipHidden = true;
  let tooltipHTML = "";
  let tooltipEl;
  let hidingTimer: NodeJS.Timeout;
  let showingTimer: NodeJS.Timeout;

  const ttWidth = 400;
  const ttHeight = 500;

  const summaryCache = new Map<string, any>();

  function getTooltipHTML(data) {
    const { thumbnail, extract_html, page_url } = data;
    const imageHTML = thumbnail ? `<img src="${thumbnail.source}" />` : "";
    const fallbackText = `Can't find a preview. See <a href="${page_url}">the original article</a>`;

    return `${imageHTML}<div class="text">${extract_html || fallbackText}</div>`;
  }

  async function loadTooltipPreview(node) {
    if (node.data.extract_html || summaryCache.has(node.id)) {
      return summaryCache.get(node.id) ?? node.data;
    }

    const summary = await apiClient.getSummary(node.id);
    const summaryItem = apiClient.getItem(summary);

    node.data = {
      ...node.data,
      ...summaryItem.data,
    };

    summaryCache.set(node.id, node.data);

    return node.data;
  }

  function scheduleHide() {
    clearTimeout(hoverDelayTimer);
    clearTimeout(showingTimer);

    isTooltipHidden = true;
    tooltipHTML = "";

    return null;
  }

  function scheduleShow() {
    // console.log("🚀 sheduleShow")

    return setTimeout(() => {
      // console.log("🚀🚀 show")

      isTooltipHidden = false;
      clearTimeout(showingTimer);
      showingTimer = null;
    }, 200);
  }

  function onEnterTooltip() {
    // Keep tooltip stable only after it is already visible.
    if (!isTooltipHidden) {
      clearTimeout(hidingTimer);
    }
  }

  function onLeaveTooltip() {
    // console.log("🚀 ~ onLeaveTooltip")
    scheduleHide();
  }

  function showTooltipNode(e) {
    console.log("🚀 ~ showTooltipNode ~ e", e)
    // console.log("🚀 ~ showTooltipNode ~ e", visualViewport)

    if (isWordleOn() && appState.wordle.toString().includes(e.node?.data?.pageid?.toString())) {
      return
    }

    clearTimeout(hidingTimer);
    clearTimeout(showingTimer);
    clearTimeout(hoverDelayTimer);

    if (!e.node) {
      scheduleHide();
      showingTimer = null;
      return;
    }

    // ------------------------ direction
    const center = {
      x: visualViewport.width / 2,
      y: visualViewport.height / 2,
    };

    const sign = {
      x: center.x - e.x,
      y: center.y - e.y,
    };

    const isUp = sign.y < 0;
    // ----------------------------------

    // TODO: should sanitize?
    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API
    loadTooltipPreview(e.node)
      .then((data) => {
        e.node.__loadedData = data;
      })
      .catch((error) => {
        console.warn(`Can't load preview for ${e.node.id}`, error);
      });

    hoverDelayTimer = setTimeout(() => {
      const data = e.node.__loadedData || e.node.data;
      tooltipHTML = getTooltipHTML(data);
      isTooltipHidden = false;
    }, 1000);

    // reuse current tooltip
    // if (!isTooltipHidden) {
    //   return
    // }

    // showingTimer = scheduleShow();

    let left: number;
    requestAnimationFrame(() => {
      // shift a bit left
      left = e.x - ttWidth / 3;

      // keep within viewport
      left = Math.max(10, left);
      left = Math.min(visualViewport.width - ttWidth - 10, left);

      tooltipEl.style.left = left + "px";

      if (isUp) {
        tooltipEl.style.top = "unset";
        tooltipEl.style.bottom = visualViewport.height - e.y + 20 + "px";
      } else {
        tooltipEl.style.top = e.y + 20 + "px";
        tooltipEl.style.bottom = "unset";
      }

      // ---------------- test: static corner
      // tooltipEl.style.bottom = 0
      // tooltipEl.style.top = 'unset'
      // tooltipEl.style.right = 0
      // tooltipEl.style.left = 'unset'
      // ---------------------------------------
    });
  }

  bus.on("show-tooltip-node", showTooltipNode, {});

  const wordleIdSep = '-'
  function getWordleIdsSet() {
    return new Set(appState.wordle.toString().split(wordleIdSep))
  }
  function toggleWordleId(id: number | string) {
    const ids = getWordleIdsSet()
    console.log("🚀 | toggleWordleId | ids", ids)

    const str = id.toString()
    const deleted = ids.delete(str)

    if (!deleted) {
      ids.add(str)
    }

    appState.wordle = [...ids].join(wordleIdSep)

    if (appState.wordle === 'true') {
      showConfetti = true
      showConfettiContainer = true

      setTimeout(() => {
        showConfetti = false
        if (isWordleOn()) toggleWordleMode()
      }, 4500)
      setTimeout(() => {
        showConfettiContainer = false
      }, 6000)
    }

    return !deleted
  }

  const wordleNodes = new Map()

  // --------------------------------------- node click
  function onNodeClick(e) {
    console.log("🚀 ~ onNodeClick ~ e", e)

    if (!isWordleOn()) {
      window.open(e.node.data.page_url);
    }
    else {
      console.log("🚀 | onNodeClick | e.node.data", e.node.data)
      const isIdSelected = toggleWordleId(e.node.data.pageid)

      if (isIdSelected) {
        e.text.text(wordlePlaceholder(e.node))
        wordleNodes.set(e.node.data.pageid, e)
      } else {
        e.text.text(e.node.id)
        wordleNodes.delete(e.node.data.pageid)
      }
    }

    // window.open(e.node.data.page_url, '_blank')
  }

  bus.on("show-details-node", onNodeClick, {});

  function onNodeClickRight(e) {
    // console.log("🚀 ~ onNodeClickRight ~ e", e)

    appState.query = e.node.id;
    onSearch({ detail: e.node.id });
  }

  bus.on("node-click-right", onNodeClickRight, {});

  // --------------------------------------- functions
  async function onSearch(e: CustomEvent) {
    const q = e.detail;
    currentSearchQuery = q;
    // console.log('[onSearch] query:', q);

    await performSearchWrap(q);
    renderer.render(appState.graph);
  }

  async function performSearchWrap(query) {
    const summary = await apiClient.getSummary(query);
    // console.log('[summary]', summary);

    const entryItem = apiClient.getItem(summary);
    performSearch(entryItem);
  }
</script>

<!-- <main class="app-container"> -->
{#if !appState.wordle.toString().includes('true')}
  <div class="search-panel">
    <WikiSearch
      on:search={onSearch}
      on:query-change={(event) => (currentSearchQuery = event.detail)}
    />

    <div class="layout-container graph-settings">
      <label>
        <span>Links limit</span>
        <input
          type="number"
          min="1"
          max="50"
          value={appState.linkLimit || 50}
          on:change={(event) => updateNumberSetting("linkLimit", event, 1, 50)}
        />
      </label>

      <label>
        <span>Depth</span>
        <input
          type="number"
          min="1"
          max="10"
          value={appState.maxDepth || 2}
          on:change={(event) => updateNumberSetting("maxDepth", event, 1, 10)}
        />
      </label>
    </div>
  </div>

  {:else}
  <div style="display: flex; width: fit-content; opacity: 0.7; font-weight: 500; padding: 0.7em 1em;">
    Wordle mode
  </div>
{/if}

{#if showConfettiContainer}
<div

  style="
  opacity: {showConfetti ? 1 : 0};
  transition: opacity 1.2s linear;
  position: fixed;
  bottom: -40px;
  left: 0;
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  overflow: visible;
  pointer-events: none;">
  <!-- <Confetti x={[-5, 5]} y={[0, 0.2]} delay={[0, 2000]} duration=5500 infinite amount=300 fallDistance="100vh" /> -->
  <!-- <Confetti class="left" x={[1.2, 5.5]} y={[1.25, 2.75]} delay={[0, 2500]} xSpread=0.2 amount=400 /> -->
  <!-- <Confetti class="right" x={[-1.2, -5.5]} y={[1.25, 2.75]} delay={[0, 2500]} xSpread=0.2 amount=400 /> -->
  <Confetti
    class="left"
    x={[-2.3, 2.3]} y={[1, 3.3]}
    infinite
    delay={[0, 1200]} xSpread=0.1 amount=300
    destroyOnComplete={false}
    />
    <!-- bind:infinite={showConfetti} -->
    <!-- iterationCount -->

</div>

{/if}

<div class="layout-container about-links muted">
  {#if appState.wordle.toString().includes('true')}
    <a href="#" on:click={() => (aboutWordleVisible = true)}>What is this?</a>
    <a href="#" on:click={dropWordleIds}>drop wordles</a>
  {/if}
  <a href="#" on:click={toggleWordleMode}>{'wordle ' + (appState.wordle.toString().includes('true') ? 'on' : 'off')}</a>
  <a href="#" on:click={() => (aboutVisible = true)}>about</a>
  <a
    href="https://github.com/vladivut/wiki-graph"
    target="_blank"
    rel="noopener noreferrer">code</a
  >
</div>

<div
  id="tooltip"
  bind:this={tooltipEl}
  hidden={isTooltipHidden}
  on:mouseenter={onEnterTooltip}
  on:mouseleave={onLeaveTooltip}
>
  {@html tooltipHTML}
</div>
<!-- </main> -->

{#if aboutVisible}
  <About on:hide={() => (aboutVisible = false)} />
{/if}

{#if aboutWordleVisible}
  <AboutWordle on:hide={() => (aboutWordleVisible = false)} />
{/if}

<style lang="postcss">
  /* order matters */
  @import "./assets/style.css";
  @import "normalize.css";

  /* :global(.confetti-holder) {
    position: absolute;
    bottom: 0;
  } */
  :global(.confetti) {
    position: fixed;
    bottom: 0px;
    /* left: 0; */
  }

  .search-panel {
    --search-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: fit-content;
  }

  .graph-settings {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    width: var(--search-width);
    box-sizing: border-box;
    margin-top: -0.4rem;
  }

  .graph-settings label {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3rem;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;

    padding: 0.35rem 0.45rem;
    border: 2px solid var(--borderColor);
    background-color: #fff;
    color: var(--textColor);
    font-size: 0.95rem;
  }

  .graph-settings label:focus-within {
    border-color: var(--c-accent);
    box-shadow: inset 0 0 0 1px var(--c-accent);
  }

  .graph-settings span {
    white-space: nowrap;
  }

  .graph-settings input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.15rem 0.2rem;
    border: 1px solid var(--borderColor);
    color: inherit;
    font-size: 0.9rem;
  }
</style>
