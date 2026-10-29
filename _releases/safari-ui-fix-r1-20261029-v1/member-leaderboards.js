/* Public-safe, server-ranked club boards. Never aggregate personal source rows. */
'use strict';
(function (global) {
  const boards = {rating:'BXH CLB',contribution:'Bảng vàng Cống hiến',energetic:'Năng nổ nhất',sleepy:'Khiển trách nhẹ'};
  const rowFields = ['rank','display_name','metric','rating','match_count','is_current'];
  const exact = (value, keys) => value && Object.keys(value).sort().join() === keys.slice().sort().join();
  function validate(data, board, size) {
    if (!exact(data,['board','page','page_size','total','total_ranked','total_pages','algorithm_version','minimum_matches','current_member','rows']) ||
        data.board !== board || data.page_size !== size || !Array.isArray(data.rows) || data.rows.length > size ||
        ![data.page,data.total,data.total_ranked,data.total_pages,data.minimum_matches].every(Number.isSafeInteger) ||
        data.page<1 || data.total<0 || data.total_ranked<data.total || data.total_pages!==Math.max(1,Math.ceil(data.total/size)) ||
        data.page>data.total_pages || typeof data.algorithm_version!=='string') throw Error('LEADERBOARD_UNAVAILABLE');
    const validRow = row => exact(row,rowFields) && Number.isSafeInteger(row.rank) && row.rank>0 && row.rank<=data.total_ranked &&
      typeof row.display_name==='string' && row.display_name.trim() && Number.isFinite(row.metric) &&
      (row.rating===null || Number.isFinite(row.rating)) && Number.isSafeInteger(row.match_count) && row.match_count>=0 && typeof row.is_current==='boolean';
    let last=0, mine=0;
    for (const row of data.rows) {
      if (!validRow(row) || row.rank<last || (row.is_current && ++mine>1)) throw Error('LEADERBOARD_UNAVAILABLE');
      last=row.rank;
    }
    const own=data.current_member;
    if (!own || typeof own.eligible!=='boolean' ||
        (own.eligible ? !validRow(Object.fromEntries(rowFields.map(k=>[k,own[k]]))) ||
          !exact(own,['eligible',...rowFields]) || !own.is_current : !exact(own,['eligible']))) throw Error('LEADERBOARD_UNAVAILABLE');
    return data;
  }
  async function read(client, board, page, size, search) {
    const {data,error}=await client.rpc('get_member_club_leaderboard',{p_board:board,p_page:page,p_page_size:size,p_search:search||null});
    if (error) throw Error('LEADERBOARD_UNAVAILABLE');
    return validate(data,board,size);
  }
  function mount({root,client,el,button,panel,isCurrent,board='rating'}) {
    const section=panel(board==='rating'?'BXH CLB':'Cống hiến CLB',root);
    section.classList.add('ranking-ui','club-leaderboard');
    const body=el('div');section.append(body);
    let page=1,size=20,search='',data=null,error=false,busy=false,request=0,stopped=false,focusResult=false;
    const alive=()=>!stopped && section.isConnected && isCurrent();
    const money=n=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
    const metric=row=>board==='rating'?new Intl.NumberFormat('vi-VN',{minimumFractionDigits:3,maximumFractionDigits:3}).format(row.metric):board==='contribution'?money(row.metric):`${row.metric} trận`;
    const field=(text,input)=>{const label=el('label',text,'list-control');label.append(input);return label;};
    const avatar=name=>{const node=el('span',name.trim().split(/\s+/u).slice(-2).map(part=>Array.from(part)[0]||'').join(''),'topbar-avatar');node.setAttribute('aria-hidden','true');return node;};
    function spotlight() {
      // Only the unfiltered first page contains the global leaders. Never re-rank a page.
      if(board!=='contribution'||search||data.page!==1||data.total_ranked<3||data.rows.length<3)return;
      const area=el('section',null,'contribution-spotlight');
      area.setAttribute('aria-label','Gương mặt cống hiến nổi bật');
      area.append(el('h3','Cùng tạo dấu ấn CLB'),el('p','Ba gương mặt đầu danh sách · đồng điểm giữ cùng hạng.','muted'));
      const cards=el('div',null,'contribution-spotlight-grid');
      for(const row of data.rows.slice(0,3)){
        const card=el('div',null,'ui-summary-card contribution-spotlight-card');card.dataset.rank=String(row.rank);
        const head=el('div',null,'contribution-spotlight-head');head.append(avatar(row.display_name),el('span',`#${row.rank}`,'badge'));
        card.append(head,el('strong',row.display_name),el('span',metric(row),'contribution-spotlight-value'),el('span',row.rank===1?'Dẫn đầu CLB':'Dấu ấn cống hiến','muted'));cards.append(card);
      }
      area.append(cards);body.append(area);
    }
    function draw() {
      if (!alive()) return;
      section.dataset.board=board;
      body.replaceChildren();body.setAttribute('aria-busy',String(busy));
      body.append(el('p',board==='rating'
        ? `VĐV CLUB đang hoạt động, đủ số trận Rated theo thiết lập hiện hành; đồng điểm cùng hạng.`
        : board==='contribution'?'Tổng nghĩa vụ thua/hòa từ trận đã duyệt; không phải tiền đã thu. Không gồm phạt nội quy hay nghĩa vụ riêng khác.'
        :'Số trận đã duyệt có tham gia; đồng số trận cùng hạng.','notice'));
      if (data) {
        const own=data.current_member;
        const summary=el('div',null,'ui-summary-card club-leaderboard-own');
        if(board==='contribution'){
          summary.classList.add('contribution-own-hero');
          const identity=el('div',null,'contribution-own-identity');identity.append(avatar(own.eligible?own.display_name:'Bạn'),el('span','Dấu ấn của bạn','badge'));summary.append(identity);
        }
        summary.append(el('strong',own.eligible?`Bạn đang xếp hạng #${own.rank} / ${data.total_ranked} trong CLB`:'Bạn chưa đủ điều kiện xếp hạng'));
        if (own.eligible) summary.append(el('span',`${boards[board]} · ${metric(own)}`,'muted'));
        else if (board==='rating') summary.append(el('span',`Cần là VĐV CLUB đang hoạt động và có ít nhất ${data.minimum_matches} trận Rated trong phiên bản hiện hành.`,'muted'));
        else summary.append(el('span','Chưa có giá trị đủ điều kiện trong bảng này.','muted'));
        if(board==='contribution')summary.append(el('p','Cùng ra sân, cùng gắn kết. Mỗi người góp một nhịp vui cho CLB.','muted'));
        body.append(summary);
        if(!busy&&!error)spotlight();
      }
      const form=el('form',null,'list-toolbar club-leaderboard-filters');
      const input=el('input');input.type='search';input.value=search;input.maxLength=80;input.placeholder='Tên VĐV';
      const apply=()=>{search=input.value.trim();page=1;focusResult=true;void fetchPage();};
      form.addEventListener('submit',event=>{event.preventDefault();if(!busy)apply();});
      form.append(field('Tìm kiếm',input));
      const controls=[input];
      if (board!=='rating') {
        const select=el('select');
        for (const kind of ['contribution','energetic','sleepy']) {const o=el('option',boards[kind]);o.value=kind;select.append(o);}
        select.value=board;select.addEventListener('change',()=>{board=select.value;page=1;data=null;void fetchPage();});
        form.append(field('Bảng',select));controls.push(select);
      }
      const sizes=el('select');
      for(const n of [10,20,50]) {const o=el('option',String(n));o.value=String(n);sizes.append(o);}
      sizes.value=String(size);sizes.addEventListener('change',()=>{size=Number(sizes.value);page=1;focusResult=true;void fetchPage();});
      const find=button('Tìm',apply,'btn');find.type='button';
      const clear=button('Xóa bộ lọc',()=>{search='';page=1;focusResult=true;void fetchPage();},'btn secondary');clear.type='button';
      form.append(field('Số dòng / trang',sizes),find,clear);body.append(form);
      controls.push(sizes,find,clear);for(const c of controls)c.disabled=busy;clear.disabled=busy||!search;
      if (busy) {body.append(el('p','Đang tải bảng xếp hạng…','muted'));return;}
      if (error) {body.append(el('p','Không tải được bảng xếp hạng. Kiểm tra phiên đăng nhập và thử lại.','notice error'),button('Thử lại',()=>void fetchPage(),'btn'));return;}
      if (!data) return;
      const count=el('p',data.total?`${(data.page-1)*size+1}–${Math.min(data.page*size,data.total)} / ${data.total} kết quả`:'0 kết quả','ui-list-result-count');
      count.setAttribute('aria-live','polite');count.tabIndex=-1;body.append(count);
      if (!data.rows.length) body.append(el('p',search?'Không tìm thấy VĐV phù hợp với bộ lọc.':'Chưa có VĐV đủ điều kiện trong bảng này.','muted'));
      const list=el('div',null,'ranking-list ui-card-list');
      for (const row of data.rows) {
        const card=el('div',null,`ranking-card ui-compact-card club-leaderboard-row${row.is_current?' is-current':''}`);
        card.dataset.rank=String(row.rank);
        if (row.is_current) card.setAttribute('aria-current','true');
        const name=el('div',null,'club-leaderboard-identity');
        const leading=el('div',null,'club-leaderboard-leading');
        leading.append(el('strong',`#${row.rank}`,'ranking-position'),avatar(row.display_name));
        name.append(el('h3',row.display_name,'ranking-name'));
        if (row.is_current) name.append(el('span','Bạn','badge player-self-badge'));
        const value=el('div',null,'club-leaderboard-metric');value.append(el('strong',metric(row)));
        if (board==='rating') value.append(el('span',`${row.match_count} trận Rated`,'muted'));
        card.append(leading,name,value);list.append(card);
      }
      body.append(list);
      const pager=el('nav',null,'list-pager');pager.setAttribute('aria-label','Phân trang bảng xếp hạng');
      const prev=button('Trang trước',()=>{page--;focusResult=true;void fetchPage();},'btn secondary');
      const next=button('Trang sau',()=>{page++;focusResult=true;void fetchPage();},'btn secondary');
      prev.disabled=data.page<=1;next.disabled=data.page>=data.total_pages;
      pager.append(prev,el('span',`Trang ${data.page} / ${data.total_pages}`),next);body.append(pager);
      if(focusResult){count.focus({preventScroll:true});focusResult=false;}
    }
    async function fetchPage() {
      if (busy || !alive()) return;
      const token=++request;busy=true;error=false;draw();
      try {const result=await read(client,board,page,size,search);if(alive()&&token===request){data=result;page=result.page;}}
      catch (_) {if(alive()&&token===request)error=true;}
      finally {if(alive()&&token===request){busy=false;draw();}}
    }
    void fetchPage();
    return ()=>{stopped=true;request++;};
  }
  global.PickClubLeaderboards=Object.freeze({validate,read,mount});
})(window);
