import wiki, {wikiSummary} from "wikipedia";
import {appState} from "./state";
// TODO: get rid of `wikipedia` pkg


// https://dev.to/timhuang/a-simple-way-to-detect-if-browser-is-on-a-mobile-device-with-javascript-44j3
export let isMobile = false;
if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    )
) {
    isMobile = true;
}

function __minimizeUrl(url: string) {
    return url.replaceAll(/\n\s*/g, "");
}

let restApiLang = 'en'

function RestApiBase() {
    return `https://${restApiLang}.wikipedia.org/api/rest_v1`
}

// ------------------------------------------------------------ //
//                        Auto completion                      //
// -----------------------------------------------------------//

/** Wraps `wiki.search()` method */
// async function suggest(query: string) {
//   const resSearch = await wiki.search(query, {
//     limit: 10,
//     suggestion: true,
//   });
//   console.log("resSearch:", resSearch);

//   // const resSuggest = await wiki.suggest(query);
//   // console.log("resSuggest:", resSuggest);

//   return resSearch.results;
// }

const getUrlSuggest = (query) =>
    __minimizeUrl(`
  https://${appState.lang}.wikipedia.org/w/api.php
  ?action=opensearch
  &format=json
  &formatversion=2
  &search=${query}
  &namespace=0
  &limit=10
  &origin=*`);

/**
 * Uses `Legacy Wikipedia API - api.php`
 *
 * https://www.mediawiki.org/wiki/API:Main_page
 * */
async function suggestCustom(query: string) {
    const apiEndpoint = getUrlSuggest(query);
    console.log("api endpoint:", apiEndpoint);
    console.log("encoded url:", encodeURI(query));

    const fetchSearch = (await (await fetch(apiEndpoint)).json()) as [
        string,
        string[],
        string[],
        string[]
    ];
    console.log("fetchSearch:", fetchSearch);

    // return fetchSearch [query, suggests[], ""[], links[]]
    const [, titles, , links] = fetchSearch;


    const res: SuggestionsCustom = [];
    for (let i = 0; i < titles.length; i++) {
        const chunks = links[i].split("/")
        res.push({title: titles[i], normalized: chunks[chunks.length - 1]});
    }

    return res;
}

export type SuggestionsCustom = { title: string; normalized: string }[];

type ActionApiLink = {
    ns: number;
    title: string;
};

type GraphPageItem = ActionApiLink | wikiSummary;

type ActionApiLinksResponse = {
    query?: {
        pages?: Array<{
            pageid?: number;
            ns?: number;
            title?: string;
            links?: ActionApiLink[];
        }>;
    };
};

// ------------------------------------------------------------ //
//                       Links & Preview                       //
// -----------------------------------------------------------//

/** Loads page links and intro. */
async function page(query: string) {
    const resPage = await wiki.page(query, {
        autoSuggest: true,
        redirect: false,
    });

    // REST API spec
    // https://en.wikipedia.org/api/rest_v1/#/

    // console.log("resPage:", resPage);

    // console.log("resPage.links:", await resPage.links());
    // console.log("resPage.intro:", await resPage.intro());

    // consider showing the infobox
    // console.log("resPage.infobox:", await resPage.infobox({autoSuggest: true}));

    // requires User-Agent/Api-User-Agent header
    // console.log("resPage.summary:", await resPage.summary());

    // don't need the whole content (for a preview)
    // console.log("resPage.content:", await resPage.content());

    // the "/related" route is experimental!
    // const related = await resPage.related();
    // console.log("resPage.related:", related);

    return resPage;
}

async function getSummary(query: string) {
    const endpoint = RestApiBase() + "/page/summary/" + encodeURIComponent(query);
    const response = await fetch(endpoint);

    if (!response.ok) {
        throw new Error(`Wikipedia summary API error: ${response.status}`);
    }

    const summary: wikiSummary = await response.json();

    return summary;
}

async function getResponse(query: string, limit = 50) {
    const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 50)));
    const endpoint = __minimizeUrl(`
    https://${appState.lang}.wikipedia.org/w/api.php
    ?action=query
    &format=json
    &formatversion=2
    &origin=*
    &prop=links
    &titles=${encodeURIComponent(query)}
    &plnamespace=0
    &pllimit=${safeLimit}`);

    const response = await fetch(endpoint);

    if (!response.ok) {
        throw new Error(`Wikipedia Action API error: ${response.status}`);
    }

    const data: ActionApiLinksResponse = await response.json();
    const page = data.query?.pages?.[0];

    return page?.links ?? [];
}

function getItem(item: GraphPageItem) {
    const title = item.title;
    const page_url =
        "content_urls" in item
            ? isMobile
                ? item.content_urls.mobile.page
                : item.content_urls.desktop.page
            : `https://${appState.lang}.wikipedia.org/wiki/${encodeURIComponent(
                title.replaceAll(" ", "_")
            )}`;

    const data = {
        description: "description" in item ? item.description : "",
        pageid: "pageid" in item ? item.pageid : undefined,
        extract_html: "extract_html" in item ? item.extract_html : "",
        originalimage: "originalimage" in item ? item.originalimage : undefined,
        thumbnail: "thumbnail" in item ? item.thumbnail : undefined,
        page_url,
    };

    return {id: title, data};
}

// ------------------------------------------------------------ //
//                          Languages                          //
// -----------------------------------------------------------//

// let languages = writable<languageResult[]>(null);

// // Note: here lang=en since the response is the same for any lang
// const loadLangsUrl = __minimizeUrl(`
// https://en.wikipedia.org/w/api.php
// ?meta=siteinfo
// &siprop=languages
// &format=json
// &redirects=
// &action=query
// &origin=*`);

// async function loadLangs() {
//   // if (languages) return;
//   // const langs = await wiki.languages();

//   const response = await fetch(loadLangsUrl);

//   if (!response.ok) return;

//   const langs = (await response.json()).query.languages as languageResult[];

//   languages.set(langs);
// }

function setLang(language: string) {
    // validation?

    restApiLang = language;
}

export const apiClient = {
    // suggest,
    // page,

    suggestCustom,
    getSummary,

    getResponse,
    getItem,

    // languages,
    // loadLangs,
    setLang,
};
