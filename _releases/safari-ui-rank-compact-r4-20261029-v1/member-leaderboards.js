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
  function mountBoard({root,client,el,button,panel,isCurrent,board='rating',cardMode=false,closeOthers=()=>{}}) {
    const section=panel(board==='rating'?'BXH CLB':'Cống hiến CLB',root);
    section.classList.add('ranking-ui','club-leaderboard');
    const body=el('div');section.append(body);
    let page=1,size=20,search='',data=null,error=false,busy=false,request=0,stopped=false,focusResult=false,expanded=false,leaders=null;
    let detailNode=null,toggleNode=null;
    const close=()=>{expanded=false;if(detailNode)detailNode.hidden=true;if(toggleNode){toggleNode.setAttribute('aria-expanded','false');toggleNode.textContent='Xem bảng đầy đủ';}};
    const alive=()=>!stopped && section.isConnected && isCurrent();
    const money=n=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
    const metric=row=>board==='rating'?new Intl.NumberFormat('vi-VN',{minimumFractionDigits:3,maximumFractionDigits:3}).format(row.metric):board==='contribution'?money(row.metric):`${row.metric} trận`;
    const field=(text,input)=>{const label=el('label',text,'list-control');label.append(input);return label;};
    const avatar=name=>{const node=el('span',name.trim().split(/\s+/u).slice(-2).map(part=>Array.from(part)[0]||'').join(''),'topbar-avatar');node.setAttribute('aria-hidden','true');return node;};
    function spotlight() {
      if(!cardMode||!leaders?.length)return;
      const podium=el('div',null,'contribution-podium');
      for(const row of leaders){
        const line=el('div',null,'contribution-top-line');
        line.dataset.rank=String(row.rank);
        line.append(el('span',row.rank<=3?['','🥇','🥈','🥉'][row.rank]:`#${row.rank}`,'contribution-medal'),el('span',row.display_name,'contribution-top-name'),el('span',metric(row),'contribution-top-value'));
        podium.append(line);
      }
      body.append(podium);
    }
    function draw() {
      if (!alive()) return;
      section.dataset.board=board;
      body.replaceChildren();body.setAttribute('aria-busy',String(busy));
      if(!cardMode)body.append(el('p',board==='rating'
        ? `VĐV CLUB đang hoạt động, đủ số trận Rated theo thiết lập hiện hành; đồng điểm cùng hạng.`
        : board==='contribution'?'Tổng nghĩa vụ thua/hòa từ trận đã duyệt; không phải tiền đã thu. Không gồm phạt nội quy hay nghĩa vụ riêng khác.'
        :'Số trận đã duyệt có tham gia; đồng số trận cùng hạng.','notice'));
      if (data) {
        const own=data.current_member;
        const summary=el('div',null,'ui-summary-card club-leaderboard-own');
        summary.append(el('strong',own.eligible?`Bạn đang xếp hạng #${own.rank} / ${data.total_ranked} trong CLB`:'Bạn chưa đủ điều kiện xếp hạng'));
        if (own.eligible) summary.append(el('span',`${boards[board]} · ${metric(own)}`,'muted'));
        else if (board==='rating') summary.append(el('span',`Cần là VĐV CLUB đang hoạt động và có ít nhất ${data.minimum_matches} trận Rated trong phiên bản hiện hành.`,'muted'));
        else summary.append(el('span','Chưa có giá trị đủ điều kiện trong bảng này.','muted'));

        body.append(summary);
        if(!busy&&!error)spotlight();
      }
      if(cardMode&&(busy||error))body.append(el('p',busy?'Đang tải bảng xếp hạng…':'Không tải được bảng. Mở bảng đầy đủ để thử lại.',busy?'muted':'notice error'));
      let listBody=body;
      if(cardMode){
        toggleNode=button('Xem bảng đầy đủ',()=>{expanded=!expanded;if(expanded)closeOthers(close);detailNode.hidden=!expanded;toggleNode.textContent=expanded?'Thu gọn bảng':'Xem bảng đầy đủ';toggleNode.setAttribute('aria-expanded',String(expanded));},'contribution-detail-toggle');
        toggleNode.setAttribute('aria-expanded',String(expanded));
        toggleNode.setAttribute('aria-label','Xem bảng đầy đủ — '+boards[board]);
        detailNode=el('div',null,'contribution-detail');detailNode.hidden=!expanded;body.append(toggleNode,detailNode);listBody=detailNode;
      }
      const form=el('form',null,'list-toolbar club-leaderboard-filters');
      const input=el('input',null,'field');input.type='search';input.value=search;input.maxLength=80;input.placeholder='Tên VĐV';
      const apply=()=>{search=input.value.trim();page=1;focusResult=true;void fetchPage();};
      form.addEventListener('submit',event=>{event.preventDefault();if(!busy)apply();});
      form.append(field('Tìm kiếm',input));
      const controls=[input];
      const sizes=el('select',null,'field');
      for(const n of [10,20,50]) {const o=el('option',String(n));o.value=String(n);sizes.append(o);}
      sizes.value=String(size);sizes.addEventListener('change',()=>{size=Number(sizes.value);page=1;focusResult=true;void fetchPage();});
      const find=button('Tìm',apply,'btn');find.type='button';
      const clear=button('Xóa bộ lọc',()=>{search='';page=1;focusResult=true;void fetchPage();},'btn secondary');clear.type='button';
      form.append(field('Số dòng / trang',sizes),find,clear);listBody.append(form);
      controls.push(sizes,find,clear);for(const c of controls)c.disabled=busy;clear.disabled=busy||!search;
      if (busy) {listBody.append(el('p','Đang tải bảng xếp hạng…','muted'));return;}
      if (error) {listBody.append(el('p','Không tải được bảng xếp hạng. Kiểm tra phiên đăng nhập và thử lại.','notice error'),button('Thử lại',()=>void fetchPage(),'btn'));return;}
      if (!data) return;
      const count=el('p',data.total?`${(data.page-1)*size+1}–${Math.min(data.page*size,data.total)} / ${data.total} kết quả`:'0 kết quả','ui-list-result-count');
      count.setAttribute('aria-live','polite');count.tabIndex=-1;listBody.append(count);
      if (!data.rows.length) listBody.append(el('p',search?'Không tìm thấy VĐV phù hợp với bộ lọc.':'Chưa có VĐV đủ điều kiện trong bảng này.','muted'));
      const list=el(cardMode?'table':'div',null,cardMode?'club-public-table':'ranking-list ui-card-list');
      let records=list;
      if(cardMode){
        const head=el('thead'),tr=el('tr');for(const label of ['Hạng','VĐV',board==='contribution'?'Cống hiến':'Trận']){const th=el('th',label);th.setAttribute('scope','col');tr.append(th);}head.append(tr);records=el('tbody');list.append(head,records);
      }
      for(const row of data.rows){
        const card=el(cardMode?'tr':'div',null,`club-leaderboard-row${cardMode?'':' ranking-card ui-compact-card'}${row.is_current?' is-current':''}`);
        card.dataset.rank=String(row.rank);if(row.is_current)card.setAttribute('aria-current','true');
        const rank=el(cardMode?'td':'div',`#${row.rank}`,'ranking-position');rank.setAttribute('aria-label','Hạng '+row.rank);
        const identity=el(cardMode?'td':'div',null,'club-leaderboard-identity');identity.append(el('h3',row.display_name,'ranking-name'));if(row.is_current)identity.append(el('span','Bạn','badge player-self-badge'));
        const value=el(cardMode?'td':'div',null,'ranking-rating club-leaderboard-metric');value.append(el('span',board==='rating'?'Rating':board==='contribution'?'Cống hiến':'Trận','ranking-label'),el('strong',metric(row),'ranking-value'));
        if(cardMode){card.append(rank,identity,value);}
        else{
          const header=el('div',null,'ranking-header');const matches=el('div',null,'ranking-matches');matches.append(el('span','Trận Rated','ranking-label'),el('strong',String(row.match_count),'ranking-match-count'));
          header.append(rank,identity,value,matches);card.append(header);
        }
        records.append(card);
      }
      listBody.append(list);
      const pager=el('nav',null,'list-pager');pager.setAttribute('aria-label','Phân trang bảng xếp hạng');
      const prev=button('Trang trước',()=>{page--;focusResult=true;void fetchPage();},'btn secondary');
      const next=button('Trang sau',()=>{page++;focusResult=true;void fetchPage();},'btn secondary');
      prev.disabled=data.page<=1;next.disabled=data.page>=data.total_pages;
      pager.append(prev,el('span',`Trang ${data.page} / ${data.total_pages}`),next);listBody.append(pager);
      if(focusResult){count.focus({preventScroll:true});focusResult=false;}
    }
    async function fetchPage() {
      if (busy || !alive()) return;
      const token=++request;busy=true;error=false;draw();
      try {const result=await read(client,board,page,size,search);if(alive()&&token===request){data=result;page=result.page;if(!leaders&&!search&&result.page===1)leaders=result.rows.slice(0,3);}}
      catch (_) {if(alive()&&token===request)error=true;}
      finally {if(alive()&&token===request){busy=false;draw();}}
    }
    void fetchPage();
    const dispose=()=>{stopped=true;request++;};dispose.close=close;return dispose;
  }
  function mount(options){
    if(options.board!=='contribution')return mountBoard(options);
    const {root,el,panel}=options;
    const shell=panel('Cống hiến CLB',root);shell.classList.add('member-contribution-admin');
    shell.append(el('p','Góc vui của CLB: vinh danh người âm thầm nuôi quỹ, người chăm ra sân và nhắc nhẹ những thành viên hơi lâu chưa thấy mặt. 😄','notice'));
    shell.append(el('p','Chỉ tính nghĩa vụ thua/hòa từ trận đã duyệt; không phải tiền đã thu. Không gồm phạt nội quy hay nghĩa vụ riêng khác.','muted'));
    const grid=el('div',null,'contribution-fun-grid');shell.append(grid);const disposers=[];
    const config=[['contribution','gold','❤️','“Thua không đáng sợ. Quan trọng là sau trận, quỹ CLB lại khỏe hơn một chút.” 😄'],['energetic','fire','🔥','“Có mặt đều đến mức sân mà biết nói chắc cũng gọi tên.” ⚡'],['sleepy','sleepy','😴','“CLB đang xác minh xem bạn còn nhớ đường ra sân không…” 👀']];
    for(const [board,variant,icon,joke] of config){
      disposers.push(mountBoard({...options,root:grid,board,cardMode:true,closeOthers:own=>disposers.forEach(d=>{if(d.close!==own)d.close();}),panel:(_,parent)=>{
        const card=el('section',null,'contribution-card contribution-card-'+variant);const head=el('div',null,'contribution-card-head'),title=el('div',null,'contribution-card-title-wrap');title.append(el('span',icon,'contribution-card-icon'),el('h3',boards[board],'contribution-card-title'));head.append(title);card.append(head,el('p',joke,'contribution-card-joke'));parent.append(card);return card;
      }}));
    }
    return ()=>disposers.forEach(dispose=>dispose());
  }
  global.PickClubLeaderboards=Object.freeze({validate,read,mount});
})(window);
