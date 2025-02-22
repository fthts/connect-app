import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import update from 'react-addons-update'
import _ from 'lodash'
import LinksMenu from '../../../components/LinksMenu/LinksMenu'
import FileLinksMenu from '../../../components/LinksMenu/FileLinksMenu'
import TeamManagementContainer from './TeamManagementContainer'
import { updateProject, deleteProject } from '../../actions/project'
import { loadDashboardFeeds, loadProjectMessages } from '../../actions/projectTopics'
import { loadPhaseFeed } from '../../actions/phasesTopics'
import { loadProjectPlan } from '../../actions/projectPlan'
import { setDuration } from '../../../helpers/projectHelper'
import { PROJECT_ROLE_OWNER, PROJECT_ROLE_COPILOT, PROJECT_ROLE_MANAGER,
  DIRECT_PROJECT_URL, SALESFORCE_PROJECT_LEAD_LINK, PROJECT_STATUS_CANCELLED, PROJECT_ATTACHMENTS_FOLDER,
  PROJECT_FEED_TYPE_PRIMARY, PHASE_STATUS_DRAFT, PROJECT_FEED_TYPE_MESSAGES } from '../../../config/constants'
import PERMISSIONS from '../../../config/permissions'
import { checkPermission } from '../../../helpers/permissions'
import ProjectInfo from '../../../components/ProjectInfo/ProjectInfo'
import {
  addProjectAttachment, updateProjectAttachment, uploadProjectAttachments, discardAttachments, changeAttachmentPermission,
  removeProjectAttachment
} from '../../actions/projectAttachment'
import { saveFeedComment } from '../../actions/projectTopics'

class ProjectInfoContainer extends React.Component {

  constructor(props) {
    super(props)
    this.state = {
      duration: {}
    }
    this.onChangeStatus = this.onChangeStatus.bind(this)
    this.onDeleteProject = this.onDeleteProject.bind(this)
    this.onAddNewLink = this.onAddNewLink.bind(this)
    this.onDeleteLink = this.onDeleteLink.bind(this)
    this.onEditLink = this.onEditLink.bind(this)
    this.onEditAttachment = this.onEditAttachment.bind(this)
    this.onAddFile = this.onAddFile.bind(this)
    this.onUploadAttachment = this.onUploadAttachment.bind(this)
    this.removeAttachment = this.removeAttachment.bind(this)
    this.onSubmitForReview = this.onSubmitForReview.bind(this)
    this.extractLinksFromPosts = this.extractLinksFromPosts.bind(this)
    this.extractMarkdownLink = this.extractMarkdownLink.bind(this)
    this.extractHtmlLink = this.extractHtmlLink.bind(this)
    this.extractRawLink = this.extractRawLink.bind(this)
    this.getFileAttachmentName = this.getFileAttachmentName.bind(this)
    this.extractAttachmentLinksFromPosts = this.extractAttachmentLinksFromPosts.bind(this)
    this.deletePostAttachment = this.deletePostAttachment.bind(this)
  }

  shouldComponentUpdate(nextProps, nextState) { // eslint-disable-line no-unused-vars
    return !_.isEqual(nextProps.project, this.props.project) ||
      !_.isEqual(nextProps.feeds, this.props.feeds) ||
      !_.isEqual(nextProps.phases, this.props.phases) ||
      !_.isEqual(nextProps.productsTimelines, this.props.productsTimelines) ||
      !_.isEqual(nextProps.phasesTopics, this.props.phasesTopics) ||
      !_.isEqual(nextProps.isFeedsLoading, this.props.isFeedsLoading) ||
      !_.isEqual(nextProps.isProjectProcessing, this.props.isProjectProcessing) ||
      !_.isEqual(nextProps.attachmentsAwaitingPermission, this.props.attachmentsAwaitingPermission) ||
      !_.isEqual(nextProps.attachmentPermissions, this.props.attachmentPermissions) ||
      !_.isEqual(nextProps.isSharingAttachment, this.props.isSharingAttachment) ||
      nextProps.activeChannelId !== this.props.activeChannelId
  }

  setDuration({duration, status}) {

    this.setState({duration: setDuration(duration || {}, status)})
  }

  componentWillMount() {
    const { project, isFeedsLoading, feeds, phases, phasesTopics, loadPhaseFeed, location } = this.props

    this.setDuration(project)

    // load feeds from dashboard if they are not currently loading or loaded yet
    // also it will load feeds, if we already loaded them, but it was 0 feeds before
    if (!isFeedsLoading && feeds.length < 1) {
      this.loadAllFeeds()
    }

    // load phases feeds if they are not loaded yet
    // note: old projects doesn't have phases, so we check if there are any phases at all first
    phases && phasesTopics && phases.forEach((phase) => {
      if (!phasesTopics[phase.id]) {
        loadPhaseFeed(project.id, phase.id)
      }
    })

    // handle url hash
    if (!_.isEmpty(location.hash)) {
      this.handleUrlHash(this.props)
    }
  }

  componentWillReceiveProps(props) {
    const { project, location } = props

    this.setDuration(project)

    if (!_.isEmpty(location.hash) && location.hash !== this.props.location.hash) {
      this.handleUrlHash(props)
    }
  }

  // this is just to see if the comment/feed/post/phase the url hash is attempting to scroll to is loaded or not
  // if its not loaded then we load the appropriate item
  handleUrlHash(props) {
    const { project, isFeedsLoading, phases, phasesTopics, feeds, loadProjectPlan, loadPhaseFeed, location } = props
    const hashParts = _.split(location.hash.substring(1), '-')
    const hashPrimaryId = parseInt(hashParts[1], 10)

    switch (hashParts[0]) {
    case 'comment': {
      if (!isFeedsLoading && !this.foundCommentInFeeds(feeds, hashPrimaryId)) {
        this.loadAllFeeds()
      }
      break
    }

    case 'feed': {
      if (!isFeedsLoading && !_.some(feeds, { id: hashPrimaryId})) {
        this.loadAllFeeds()
      }
      break
    }

    case 'phase': {
      const postId = parseInt(hashParts[3], 10)

      if (phases && phasesTopics) {
        if (!_.some(phases, { id: hashPrimaryId})) {
          let existingUserIds = _.map(project.members, 'userId')
          existingUserIds= _.union(existingUserIds, _.map(project.invites, 'userId'))
          loadProjectPlan(project.id, existingUserIds)
        } else if(postId && !(phasesTopics[hashPrimaryId].topic && phasesTopics[hashPrimaryId].topic.postIds.includes(postId))) {
          loadPhaseFeed(project.id, hashPrimaryId)
        }
      }
      break
    }
    }
  }

  loadAllFeeds() {
    const { canAccessPrivatePosts, loadDashboardFeeds, loadProjectMessages, project } = this.props

    loadDashboardFeeds(project.id)
    canAccessPrivatePosts && loadProjectMessages(project.id)
  }

  foundCommentInFeeds(feeds, commentId) {
    let commentFound = false

    _.forEach(feeds, feed => _.forEach(feed.posts, post => {
      if (post.id === commentId) {
        commentFound = true
        return false
      }
    }))

    return commentFound
  }

  onChangeStatus(projectId, status, reason) {
    const delta = {status}
    if (reason && status === PROJECT_STATUS_CANCELLED) {
      delta.cancelReason = reason
    }
    this.props.updateProject(projectId, delta)
  }

  onAddNewLink(link) {
    const { updateProject, project } = this.props
    updateProject(project.id, {
      bookmarks: update(project.bookmarks || [], { $push: [link] })
    })
  }

  onDeleteLink(idx) {
    const { updateProject, project } = this.props
    updateProject(project.id, {
      bookmarks: update(project.bookmarks, { $splice: [[idx, 1]] })
    })
  }

  onEditLink(idx, title, address) {
    const { updateProject, project } = this.props
    const updatedLink = {
      title,
      address
    }
    updateProject(project.id, {
      bookmarks: update(project.bookmarks, { $splice: [[idx, 1, updatedLink]] })
    })
  }

  onEditAttachment(attachmentId, title, allowedUsers) {
    const { project, updateProjectAttachment } = this.props
    const updatedAttachment = {
      title,
      allowedUsers
    }
    const attachment = project.attachments.find(attachment => attachment.id === attachmentId)
    if (attachment) {
      updateProjectAttachment(project.id,
        attachment.id,
        updatedAttachment
      )
    }
  }

  removeAttachment(attachmentId) {
    const { project } = this.props
    this.props.removeProjectAttachment(project.id, attachmentId)
  }

  onDeleteProject() {
    const { deleteProject, project } = this.props
    deleteProject(project.id)
  }

  onAddFile() {
  }

  onUploadAttachment(attachment) {
    const { project } = this.props
    this.props.uploadProjectAttachments(project.id, attachment)
  }

  onSubmitForReview() {
    const { updateProject, project } = this.props
    updateProject(project.id, { status: 'in_review'})
  }

  extractHtmlLink(str) {
    const links = []
    const regex = /<a[^>]+href="(.*?)"[^>]*>([\s\S]*?)<\/a>/gm
    const urlRegex = /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/gm // eslint-disable-line no-useless-escape
    const rawLinks = regex.exec(str)

    if (Array.isArray(rawLinks)) {
      let i = 0
      while (i < rawLinks.length) {
        const title = rawLinks[i + 2]
        const address = rawLinks[i + 1]

        if (urlRegex.test(address)) {
          links.push({
            title,
            address
          })
        }

        i = i + 3
      }
    }

    return links
  }

  extractMarkdownLink(str) {
    const links = []
    const regex = /(?:__|[*#])|\[(.*?)\]\((.*?)\)/gm
    const urlRegex = /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/gm // eslint-disable-line no-useless-escape
    const rawLinks = regex.exec(str)

    if (Array.isArray(rawLinks)) {
      let i = 0
      while (i < rawLinks.length) {
        const title = rawLinks[i + 1]
        const address = rawLinks[i + 2]

        if (urlRegex.test(address)) {
          links.push({
            title,
            address
          })
        }

        i = i + 3
      }
    }

    return links
  }

  extractRawLink(str) {
    let links = []
    const regex = /(\s|^)(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,}[\s])(\s|$)/igm // eslint-disable-line no-useless-escape
    const rawLinks = str.match(regex)

    if (Array.isArray(rawLinks)) {
      links = rawLinks
        .filter(link => !link.includes(']'))
        .map(link => {
          const name = link.trim()
          const url = !/^https?:\/\//i.test(name) ? 'http://' + name : name

          return {
            title: name,
            address: url
          }
        })
    }

    return links
  }

  extractLinksFromPosts(feeds) {
    const links = []
    feeds.forEach(feed => {
      let childrenLinks = []
      feed.posts.forEach(post => {
        childrenLinks = childrenLinks.concat([
          ...this.extractHtmlLink(post.rawContent),
          ...this.extractMarkdownLink(post.rawContent),
          ...this.extractRawLink(post.rawContent)
        ])
      })

      if (childrenLinks.length > 0) {
        links.push({
          title: feed.title,
          children: childrenLinks
        })
      }
    })

    return links
  }

  getFileAttachmentName(originalFileName) {
    return /^.*.\/[^_]+_(.*.)$/.exec(originalFileName)[1]
  }

  extractAttachmentLinksFromPosts(feeds) {
    const attachmentLinks = []
    feeds.forEach(feed => {
      const attachmentLinksPerFeed = []
      feed.posts.forEach(post => {
        post.attachments.forEach(attachment => {
          attachmentLinksPerFeed.unshift({
            title: this.getFileAttachmentName(attachment.originalFileName),
            address: `/projects/messages/attachments/${attachment.id}`,
            attachmentId: attachment.id,
            attachment: true,
            deletable: true,
            createdBy: attachment.createdBy,
            postId: post.id,
            topicId: feed.id,
            topicTag: feed.tag
          })
        })
      })

      if (attachmentLinksPerFeed.length > 0) {
        attachmentLinks.push({
          title: feed.title,
          children: attachmentLinksPerFeed
        })
      }
    })

    return attachmentLinks
  }

  deletePostAttachment({ topicId, postId, attachmentId, topicTag }) {
    const { feeds, phasesTopics, saveFeedComment } = this.props

    let feed
    if (topicTag === 'PRIMARY') {
      feed = feeds.find(feed => feed.id === topicId)
    } else {
      const phaseFeeds = Object.keys(phasesTopics)
        .map(key => phasesTopics[key].topic)
      feed = phaseFeeds.find(feed => feed.id && feed.id === topicId)
    }
    if (feed) {
      const post = feed.posts.find(post => post.id === postId)
      if (post) {
        const attachments = post.attachments
          .filter(attachment => attachment.id !== attachmentId)
        const attachmentIds = attachments.map(attachment => attachment.id)
        saveFeedComment(topicId, feed.tag, {
          id: postId,
          content: post.rawContent,
          attachmentIds
        })
      }
    }
  }

  render() {
    const { duration } = this.state
    const { project, currentMemberRole, isSuperUser, phases, feeds,
      hideInfo, hideLinks, hideMembers, onChannelClick, activeChannelId, productsTimelines,
      isManageUser, phasesTopics, isProjectPlan, isProjectProcessing, projectTemplates,
      attachmentsAwaitingPermission, addProjectAttachment, discardAttachments, attachmentPermissions,
      changeAttachmentPermission, projectMembers, loggedInUser, isSharingAttachment, canAccessPrivatePosts } = this.props
    let directLinks = null
    // check if direct links need to be added
    const isMemberOrCopilot = _.indexOf([PROJECT_ROLE_COPILOT, PROJECT_ROLE_MANAGER], currentMemberRole) > -1
    if (isMemberOrCopilot || isSuperUser) {
      directLinks = []
      if (project.directProjectId) {
        directLinks.push({name: 'Project in Topcoder Direct', href: `${DIRECT_PROJECT_URL}${project.directProjectId}`})
      } else {
        directLinks.push({name: 'Direct project not linked. Contact support.', href: 'mailto:support@topcoder.com'})
      }
      directLinks.push({name: 'Salesforce Lead', href: `${SALESFORCE_PROJECT_LEAD_LINK}${project.id}`})
    }

    const canDeleteProject = currentMemberRole === PROJECT_ROLE_OWNER && project.status === 'draft'
    const canManageLinks = !!currentMemberRole || isSuperUser

    let devices = []
    const primaryTarget = _.get(project, 'details.appDefinition.primaryTarget')
    if (primaryTarget && !primaryTarget.seeAttached) {
      devices.push(primaryTarget.value)
    } else {
      devices = _.get(project, 'details.devices', [])
    }

    let attachments = project.attachments
    // merges the product attachments to show in the links menu
    if (phases && phases.length > 0) {
      phases.forEach(phase => {
        if (phase.products && phase.products.length > 0) {
          phase.products.forEach(product => {
            if (product.attachments && product.attachments.length > 0) {
              attachments = attachments.concat(product.attachments)
            }
          })
        }
      })
    }
    attachments = _.sortBy(attachments, attachment => -new Date(attachment.updatedAt).getTime())
      .map(attachment => ({
        id: attachment.id,
        title: attachment.title,
        address: attachment.downloadUrl,
        allowedUsers: attachment.allowedUsers,
        createdBy : attachment.createdBy
      }))

    // get list of phase topic in same order as phases
    // note: for old projects which doesn't have phases we return an empty array
    const visiblePhases = phases && phases.filter((phase) => (
      isSuperUser || isManageUser || phase.status !== PHASE_STATUS_DRAFT
    )) || []

    const phaseFeeds = _.compact(
      visiblePhases.map((phase) => {
        const topic = _.get(phasesTopics, `[${phase.id}].topic`)

        if (!topic) {
          return null
        }

        return ({
          ...topic,
          phaseId: phase.id,
          phaseName: phase.name,
        })
      })
    )

    const discussions = [...feeds, ...phaseFeeds].map((feed) => ({
      title: feed.phaseName ? `${feed.phaseName}` : `${feed.title}`,
      address: (feed.tag === PROJECT_FEED_TYPE_PRIMARY || feed.tag === PROJECT_FEED_TYPE_MESSAGES) ? `/projects/${project.id}#feed-${feed.id}` : `/projects/${project.id}/plan#phase-${feed.phaseId}-posts`,
      noNewPage: true,
      //if PRIMARY discussion is to be loaded for project-plan page we won't attach the callback, for smoother transition to dashboard page
      onClick: !(isProjectPlan && (feed.tag === PROJECT_FEED_TYPE_PRIMARY || feed.tag === PROJECT_FEED_TYPE_MESSAGES)) && onChannelClick ? () => onChannelClick(feed) : null,
      allowDefaultOnClick: true,
      isActive: feed.id === activeChannelId,
    }))

    const attachmentsStorePath = `${PROJECT_ATTACHMENTS_FOLDER}/${project.id}/`
    let enableFileUpload = true
    if(project.version !== 'v2') {
      const templateId = _.get(project, 'templateId')
      const projectTemplate = _.find(projectTemplates, template => template.id === templateId)
      enableFileUpload = _.some(projectTemplate.scope.sections, section => {
        return _.some(section.subSections, subSection => subSection.id === 'files')
      })
    }

    // extract links from posts
    const topicLinks = this.extractLinksFromPosts(feeds)
    const publicTopicLinks = topicLinks.filter(link => link.tag !== PROJECT_FEED_TYPE_MESSAGES)
    const privateTopicLinks = topicLinks.filter(link => link.tag === PROJECT_FEED_TYPE_MESSAGES)
    const phaseLinks = this.extractLinksFromPosts(phaseFeeds)

    let links = []
    links = links.concat(project.bookmarks)
    links = links.concat(publicTopicLinks)
    if (canAccessPrivatePosts) {
      links = links.concat(privateTopicLinks)
    }
    links = links.concat(phaseLinks)

    // extract attachment from posts
    attachments = [
      ...attachments,
      ...this.extractAttachmentLinksFromPosts(feeds),
      ...this.extractAttachmentLinksFromPosts(phaseFeeds)
    ]

    return (
      <div>
        <div className="sideAreaWrapper">
          {!hideInfo &&
            <ProjectInfo
              project={project}
              phases={phases}
              currentMemberRole={currentMemberRole}
              duration={duration}
              canDeleteProject={canDeleteProject}
              onDeleteProject={this.onDeleteProject}
              onChangeStatus={this.onChangeStatus}
              directLinks={directLinks}
              isSuperUser={isSuperUser}
              productsTimelines = {productsTimelines}
              onSubmitForReview={this.onSubmitForReview}
              isProjectProcessing={isProjectProcessing}
            />
          }
          <LinksMenu
            links={discussions}
            title="Discussions"
            moreText="view all"
            noDots
            withHash
          />
          {(enableFileUpload || attachments.length > 0) &&
            <FileLinksMenu
              links={attachments}
              title="Files"
              onDelete={this.removeAttachment}
              onEdit={this.onEditAttachment}
              onAddNewLink={this.onAddFile}
              onAddAttachment={addProjectAttachment}
              onUploadAttachment={this.onUploadAttachment}
              isSharingAttachment={isSharingAttachment}
              discardAttachments={discardAttachments}
              onChangePermissions={changeAttachmentPermission}
              selectedUsers={attachmentPermissions}
              projectMembers={projectMembers}
              pendingAttachments={attachmentsAwaitingPermission}
              loggedInUser={loggedInUser}
              moreText="view all files"
              noDots
              attachmentsStorePath={attachmentsStorePath}
              onDeletePostAttachment={this.deletePostAttachment}
            />
          }
          {!hideLinks &&
            <LinksMenu
              links={links}
              canDelete={canManageLinks}
              canEdit={canManageLinks}
              canAdd={canManageLinks}
              onAddNewLink={this.onAddNewLink}
              onDelete={this.onDeleteLink}
              onEdit={this.onEditLink}
            />
          }
          {!hideMembers &&
            <TeamManagementContainer projectId={project.id} members={project.members} />
          }
        </div>
      </div>
    )
  }
}

ProjectInfoContainer.PropTypes = {
  currentMemberRole: PropTypes.string,
  phases: PropTypes.array,
  feeds: PropTypes.array,
  phasesTopics: PropTypes.array,
  project: PropTypes.object.isRequired,
  isSuperUser: PropTypes.bool,
  isManageUser: PropTypes.bool,
  productsTimelines : PropTypes.object.isRequired,
  isProjectPlan: PropTypes.bool,
  isProjectProcessing: PropTypes.bool,
  canAccessPrivatePosts: PropTypes.bool.isRequired,
}

const mapStateToProps = ({ templates, projectState, members, loadUser }) => {
  const project = projectState.project
  const projectMembers = _.filter(members.members, m => _.some(project.members, pm => pm.userId === m.userId))
  const canAccessPrivatePosts = checkPermission(PERMISSIONS.ACCESS_PRIVATE_POST)
  return ({
    projectTemplates : templates.projectTemplates,
    attachmentsAwaitingPermission: projectState.attachmentsAwaitingPermission,
    attachmentPermissions: projectState.attachmentPermissions,
    isSharingAttachment: projectState.processingAttachments,
    projectMembers:  _.keyBy(projectMembers, 'userId'),
    loggedInUser: loadUser.user,
    canAccessPrivatePosts
  })
}

const mapDispatchToProps = { updateProject, deleteProject, addProjectAttachment, updateProjectAttachment,
  loadProjectMessages, discardAttachments, uploadProjectAttachments, loadDashboardFeeds, loadPhaseFeed, changeAttachmentPermission,
  removeProjectAttachment, loadProjectPlan, saveFeedComment }

export default connect(mapStateToProps, mapDispatchToProps)(withRouter(ProjectInfoContainer))
